import os
import asyncio
import json
import time
import random
import io
import base64
import logging
import re
import requests
from typing import List, Dict, Optional, Any
from datetime import datetime, timezone
from contextlib import suppress
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query, Request, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from pydantic import BaseModel, Field

try:
    from deep_translator import GoogleTranslator
    HAS_GOOGLE_TRANSLATOR = True
except Exception:
    GoogleTranslator = None
    HAS_GOOGLE_TRANSLATOR = False

load_dotenv()

logger = logging.getLogger("echotext")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

try:
    import qrcode as qrcode_lib
    HAS_QRCODE = True
except ImportError:
    HAS_QRCODE = False

from asr_simulator import ASRSimulator
from nlp_processor import SmartNLPProcessor, CaseSummary

try:
    from ghana_nlp import GhanaNLP
    HAS_TRANSLATOR = True
except ImportError:
    HAS_TRANSLATOR = False


app = FastAPI(title="EchoText Ghana API", version="1.0.0")

PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "https://hackaton-4565.onrender.com").rstrip("/")
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "*").split(",")

COUNTER_PIN_MAP = {
    "counter_1": "1234",
    "counter_2": "5678",
    "counter_3": "9012",
}

_COUNTER_NUMBER_RE = re.compile(r"(\d+)")


def _normalize_counter_id(raw: str) -> str:
    """Map every spelling of a counter to one canonical session id.

    The agent types the counter id by hand ("Counter 1", "counter 1", "1")
    while the customer joins through a QR code ("/join/counter_1"). If those
    two strings differ the agent and the customer end up in two different
    sessions and no message ever crosses between them.
    """
    value = str(raw or "").strip().lower()
    if not value:
        return ""
    value = re.sub(r"[^a-z0-9]+", "_", value).strip("_")
    if not value:
        return ""
    if value.isdigit():
        return f"counter_{value}"
    match = _COUNTER_NUMBER_RE.search(value)
    if match and value.startswith("counter"):
        return f"counter_{match.group(1)}"
    if re.fullmatch(r"c\d+", value):
        return f"counter_{value[1:]}"
    return value


def _known_counter_ids() -> List[str]:
    return list(COUNTER_PIN_MAP.keys())


def _get_counter_pin(counter_id: str) -> str:
    normalized = _normalize_counter_id(counter_id)
    pin = COUNTER_PIN_MAP.get(normalized) or COUNTER_PIN_MAP.get(normalized.upper())
    if not pin:
        pin = f"{abs(hash(normalized)) % 10000:04d}"
        COUNTER_PIN_MAP[normalized] = pin
        COUNTER_PIN_MAP[normalized.upper()] = pin
    return pin

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class Session(BaseModel):
    session_id: str
    counter_id: str
    customer_name: Optional[str] = None
    language: str = "en"
    agent_language: str = "en"
    translation_mode: str = "translated"
    status: str = "waiting"
    created_at: str
    transcripts: List[Dict] = Field(default_factory=list)
    cards: List[Dict] = Field(default_factory=list)
    connected_at: float = 0
    case_number: Optional[str] = None
    sms_sent: bool = False
    case_summary: Dict[str, Any] = Field(default_factory=dict)


class TranslationRequest(BaseModel):
    tree: Dict
    target_language: str = "tw"


class TextTranslationRequest(BaseModel):
    text: str


class SMSRequest(BaseModel):
    phone_number: str
    message: Optional[str] = None
    case_number: str
    session_id: Optional[str] = None
    problem_summary: Optional[str] = None
    customer_profile: Optional[Dict[str, Any]] = None
    session_history: Optional[List[Dict[str, Any]]] = None


class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, Dict[str, WebSocket]] = {}
        self.sessions: Dict[str, Session] = {}
        self.asr_instances: Dict[str, ASRSimulator] = {}
        self.nlp = SmartNLPProcessor()
        self.metrics: Dict[str, Dict[str, Any]] = {}
        # session_id -> role -> messages waiting for that role to connect
        self.pending: Dict[str, Dict[str, List[dict]]] = {}

    MAX_PENDING_PER_ROLE = 50

    async def connect(self, session_id: str, websocket: WebSocket, role: str, language: str = "en"):
        await websocket.accept()
        self.active_connections.setdefault(session_id, {})[role] = websocket
        counter_id = session_id
        if counter_id.endswith("_session"):
            counter_id = counter_id.removesuffix("_session")
        if session_id not in self.sessions:
            self.sessions[session_id] = Session(
                session_id=session_id,
                counter_id=counter_id,
                created_at=datetime.now(timezone.utc).isoformat(),
                language=language if role == "customer" else "en",
                agent_language=language if role == "agent" else "en",
            )
        else:
            if role == "customer":
                self.sessions[session_id].language = language
                if self.sessions[session_id].status in ("ended", "resolved", None):
                    self.sessions[session_id].status = "active"
                    self.sessions[session_id].transcripts = []
                    self.sessions[session_id].cards = []
                    self.sessions[session_id].case_summary = {}
            elif role == "agent":
                self.sessions[session_id].agent_language = language
                self.sessions[session_id].status = "active"
                if "customer" not in self.active_connections.get(session_id, {}):
                    # No live customer on this counter: start from a clean
                    # session. When a customer is already waiting, their
                    # earlier messages must be kept.
                    self.sessions[session_id].transcripts = []
                    self.sessions[session_id].cards = []
                    self.sessions[session_id].case_summary = {}
        self.sessions[session_id].connected_at = time.time()
        logger.info("[ws] connect session=%s role=%s language=%s active_roles=%s", session_id, role, language, list(self.active_connections.get(session_id, {}).keys()))
        await self.flush_pending(session_id, role)

    def disconnect(self, session_id: str, role: str):
        session_connections = self.active_connections.get(session_id)
        if session_connections and role in session_connections:
            del session_connections[role]
        if session_id in self.active_connections and not self.active_connections[session_id]:
            del self.active_connections[session_id]

    async def send_json(self, session_id: str, data: dict):
        for ws in self.active_connections.get(session_id, {}).values():
            with suppress(Exception):
                await ws.send_json(data)

    async def send_to_role(self, session_id: str, role: str, data: dict):
        ws = self.active_connections.get(session_id, {}).get(role)
        logger.info("[ws] send_to_role session=%s role=%s data_type=%s ws=%s", session_id, role, data.get("type"), bool(ws))
        if ws:
            try:
                await ws.send_json(data)
            except Exception as exc:
                logger.exception("[ws] send_to_role failed session=%s role=%s: %s", session_id, role, exc)

    def _queue_pending(self, session_id: str, role: str, data: dict) -> None:
        queue = self.pending.setdefault(session_id, {}).setdefault(role, [])
        queue.append(data)
        if len(queue) > self.MAX_PENDING_PER_ROLE:
            del queue[: len(queue) - self.MAX_PENDING_PER_ROLE]

    async def flush_pending(self, session_id: str, role: str) -> None:
        """Deliver messages that were sent before this role joined."""
        queued = self.pending.get(session_id, {}).pop(role, [])
        if not queued:
            return
        logger.info("[ws] flushing %d pending message(s) session=%s role=%s", len(queued), session_id, role)
        for message in queued:
            await self.send_to_role(session_id, role, message)

    async def broadcast_presence(self, session_id: str) -> None:
        """Tell both sides who is currently connected to the session.

        Without this the agent has no way of noticing that the customer is
        on a different counter or that their socket dropped.
        """
        connections = self.active_connections.get(session_id, {})
        await self.send_json(session_id, {
            "type": "presence",
            "session_id": session_id,
            "roles": list(connections.keys()),
            "customer_connected": "customer" in connections,
            "agent_connected": "agent" in connections,
            "timestamp": int(time.time() * 1000),
        })

    async def deliver(self, session_id: str, role: str, data: dict) -> bool:
        """Send a message to a role, buffering it when that role is offline.

        Messages used to be dropped when the peer had not connected yet, which
        is exactly what happens when a customer types before the agent signs
        in at the counter.
        """
        ws = self.active_connections.get(session_id, {}).get(role)
        if ws is None:
            self._queue_pending(session_id, role, data)
            logger.warning(
                "[ws] role %s not connected for session %s, message queued (%d pending)",
                role, session_id, len(self.pending.get(session_id, {}).get(role, [])),
            )
            return False
        try:
            await ws.send_json(data)
            return True
        except Exception as exc:
            logger.exception("[ws] deliver failed session=%s role=%s: %s", session_id, role, exc)
            self._queue_pending(session_id, role, data)
            return False

    async def deliver_translation(
        self,
        session_id: str,
        role: str,
        payload: dict,
        original_text: str,
        target_language: str,
        source_language: str,
        sender_role: str = "customer",
    ) -> None:
        """Translate an already delivered transcript and send it as an update.

        The update carries the same timestamp as the original message, so the
        frontends merge it into the existing bubble instead of adding a
        duplicate one.
        """
        translated = await _translate_text_async(original_text, target_language, source_language)
        update = {**payload, "translation_pending": False}
        if payload.get("translation_mode") == "dual" and sender_role == "agent":
            update["original_text"] = original_text
        if translated and translated.strip() and translated.strip().lower() != original_text.strip().lower():
            update["text"] = translated
            update["is_translation"] = True
            session = self.sessions.get(session_id)
            if session:
                for entry in session.transcripts:
                    if entry.get("timestamp") == payload.get("timestamp"):
                        entry["text"] = translated
                        break
                try:
                    session.case_summary = self._compute_case_summary(session)
                except Exception as exc:
                    logger.exception("[ws] translation case summary failed session=%s: %s", session_id, exc)
        else:
            update["translation_unavailable"] = True
        await self.deliver(session_id, role, update)

    async def broadcast(self, session_id: str, data: dict, exclude_role: str = None):
        for role, ws in list(self.active_connections.get(session_id, {}).items()):
            if role == exclude_role:
                continue
            with suppress(Exception):
                await ws.send_json(data)

    def get_session(self, session_id: str) -> Session:
        return self.sessions.get(session_id)

    def _compute_case_summary(self, session: Session) -> Dict[str, Any]:
        try:
            summary = self.nlp.build_case_summary(session.transcripts, session.model_dump())
            return summary.to_dict()
        except Exception:
            logger.exception("Failed to compute case summary for session %s", session.session_id)
            return {}

    def record_metric(self, session_id: str, key: str, value: Any = 1) -> None:
        session_metrics = self.metrics.setdefault(session_id, {})
        session_metrics[key] = session_metrics.get(key, 0) + value

    def get_session_metrics(self, session_id: str) -> Dict[str, Any]:
        return self.metrics.get(session_id, {})

    async def stream_transcription(self, session_id: str, language: str = "en"):
        asr = ASRSimulator(language=language)
        self.asr_instances[session_id] = asr
        asr.start()
        session = self.sessions.get(session_id)
        try:
            async for segment in asr.stream_conversation():
                if session_id not in self.active_connections:
                    break
                seg_dict = {
                    "type": "transcript",
                    "text": segment.text,
                    "speaker": segment.speaker,
                    "start_time": segment.start_time,
                    "end_time": segment.end_time,
                    "confidence": segment.confidence,
                    "is_final": segment.is_final,
                    "timestamp": int(time.time() * 1000),
                }
                if session:
                    session.transcripts.append(seg_dict)
                    nlp_result = self.nlp.process(segment.text, segment.speaker)
                    if nlp_result["cards"]:
                        for card in nlp_result["cards"]:
                            if card["value"] not in [c["value"] for c in session.cards]:
                                session.cards.append(card)
                        seg_dict["cards"] = nlp_result["cards"]
                        seg_dict["entities"] = nlp_result["entities"]
                    session.case_summary = self._compute_case_summary(session)
                    seg_dict["case_summary"] = session.case_summary
                await self.send_json(session_id, seg_dict)
        except Exception as exc:
            logger.exception("stream_transcription error for %s: %s", session_id, exc)
        finally:
            asr.stop()
            await self.send_json(session_id, {"type": "status", "status": "ended", "message": "Transcription session ended"})

    async def send_sms(self, session_id: str, phone_number: str, case_number: str, problem_summary: Optional[str] = None, customer_profile: Optional[Dict[str, Any]] = None, session_history: Optional[List[Dict[str, Any]]] = None) -> Dict:
        session = self.sessions.get(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        problem = problem_summary or "general inquiry"
        problem_label = problem.replace("_", " ").title()
        customer_name = customer_profile.get("name") if isinstance(customer_profile, dict) else None
        history_lines = ""
        if isinstance(session_history, list) and session_history:
            history_lines = "\nRecent topics: " + ", ".join(item.get("title", "") for item in session_history[:3])
        message = (
            f"EchoText Ghana: Your support case {case_number} has been confirmed. "
            f"Issue: {problem_label}. "
        )
        if customer_name:
            message += f"Customer: {customer_name}. "
        message += f"Session ID: {session_id}{history_lines}"
        sms_record = {
            "to": phone_number,
            "message": message,
            "case_number": case_number,
            "status": "delivered",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "provider": "EchoText SMS Gateway (Simulated)",
        }
        if session:
            session.case_number = case_number
            session.sms_sent = True
            session.case_summary = self._compute_case_summary(session)
        await self.send_json(session_id, {"type": "sms", "data": sms_record})
        return sms_record

    async def send_post_call_summary(self, session_id: str) -> Dict[str, Any]:
        session = self.sessions.get(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        summary = self._compute_case_summary(session)
        customer_name = summary.get("customer_name")
        phone = summary.get("phone")
        summary_text = (
            f"Post-call summary for case {summary.get('case_number') or session_id}:\n"
            f"Issue: {summary.get('problem_label', 'General Inquiry')}\n"
            f"Status: {summary.get('status', 'open').replace('_', ' ').title()}\n"
            f"Turns: {summary.get('turns', 0)}\n"
            f"Resolution: {summary.get('resolution') or 'Pending'}\n"
        )
        if customer_name:
            summary_text += f"Customer: {customer_name}\n"
        if phone:
            summary_text += f"Phone: {phone}\n"
        await self.send_json(session_id, {
            "type": "post_call_summary",
            "data": {
                "case_number": summary.get("case_number"),
                "summary": summary,
                "text": summary_text,
            }
        })
        return {"status": "sent", "summary": summary}


manager = ConnectionManager()

TRANSLATION_CACHE: Dict[str, Dict] = {}
TRANSLATION_CACHE_PATH = os.path.join(os.path.dirname(__file__), "translation_cache.json")

LANGUAGE_CODE_MAP = {
    "tw": "tw",
    "en": "en",
}


def _get_language_pair(source_language: str, target_language: str) -> str:
    source = LANGUAGE_CODE_MAP.get(source_language, source_language)
    target = LANGUAGE_CODE_MAP.get(target_language, target_language)
    return f"{source}-{target}"


def _is_quota_error(exc: Exception) -> bool:
    """Detect quota/rate-limit errors from ghana-nlp so we can skip it quickly."""
    msg = str(exc).lower()
    return any(k in msg for k in ("quota", "rate limit", "429", "exceeded", "limit", "unauthorized", "401", "forbidden", "403"))


_QUOTA_HIT: Dict[str, float] = {}
_QUOTA_COOLDOWN = float(os.getenv("TRANSLATION_QUOTA_COOLDOWN", "300"))

# provider:pair -> timestamp at which the provider may be tried again.
# A dead provider used to be retried on EVERY message, which blocked the
# event loop for seconds per message and made live transcripts look frozen.
_PROVIDER_DISABLED: Dict[str, float] = {}
_PROVIDER_COOLDOWN = float(os.getenv("TRANSLATION_PROVIDER_COOLDOWN", "300"))
_PROVIDER_TIMEOUT = float(os.getenv("TRANSLATION_PROVIDER_TIMEOUT", "4"))
_TRANSLATION_BUDGET = float(os.getenv("TRANSLATION_BUDGET", "6"))


def _mark_quota_hit(pair: str):
    _QUOTA_HIT[pair] = time.time()


def _quota_active(pair: str) -> bool:
    ts = _QUOTA_HIT.get(pair)
    if not ts:
        return False
    if time.time() - ts > _QUOTA_COOLDOWN:
        _QUOTA_HIT.pop(pair, None)
        return False
    return True


def _provider_ready(provider: str, pair: str) -> bool:
    key = f"{provider}:{pair}"
    until = _PROVIDER_DISABLED.get(key)
    if until is None:
        return True
    if time.time() >= until:
        _PROVIDER_DISABLED.pop(key, None)
        return True
    return False


def _disable_provider(provider: str, pair: str, seconds: float = None) -> None:
    cooldown = _PROVIDER_COOLDOWN if seconds is None else seconds
    _PROVIDER_DISABLED[f"{provider}:{pair}"] = time.time() + cooldown
    logger.warning("[i18n] provider %s disabled for %s (%ss)", provider, pair, int(cooldown))


def _get_translator():
    if not HAS_TRANSLATOR:
        raise RuntimeError("ghana-nlp is not installed")
    api_key = os.getenv("KHAYA_API_KEY")
    if not api_key:
        raise RuntimeError("KHAYA_API_KEY is not set")
    return GhanaNLP(api_key=api_key)


_LIBRETRANSLATE_URL = os.getenv("LIBRETRANSLATE_URL", "").rstrip("/")
_LIBRETRANSLATE_API_KEY = os.getenv("LIBRETRANSLATE_API_KEY", "")


class _ProviderUnavailable(RuntimeError):
    """Raised when a translation provider is unreachable, blocked or rate-limited."""


# Google/LibreTranslate use "ak" for Akan (Twi); ghana-nlp uses "tw".
_PROVIDER_LANG = {"tw": "ak", "ak": "ak", "en": "en"}


def _provider_lang(code: str) -> str:
    normalized = (code or "en").lower()
    return _PROVIDER_LANG.get(normalized, normalized)


def _translate_ghana_nlp(text: str, target_language: str, source_language: str = "en") -> Optional[str]:
    """Primary translator. Returns None when the provider cannot help."""
    if not text:
        return text
    if not HAS_TRANSLATOR:
        raise _ProviderUnavailable("ghana-nlp is not installed")
    if not os.getenv("KHAYA_API_KEY"):
        raise _ProviderUnavailable("KHAYA_API_KEY is not set")
    try:
        translator = _get_translator()
        translated = translator.translate(text=text, language_pair=f"{source_language}-{target_language}")
    except Exception as exc:
        pair = f"{source_language}-{target_language}"
        if _is_quota_error(exc):
            _mark_quota_hit(pair)
        raise _ProviderUnavailable(f"ghana-nlp error: {exc}") from exc
    # ghana-nlp returns a dict like {"type": ..., "message": ...} on error
    # instead of raising — treat that as a failure.
    if isinstance(translated, dict):
        pair = f"{source_language}-{target_language}"
        if _is_quota_error(str(translated.get("message", ""))):
            _mark_quota_hit(pair)
        raise _ProviderUnavailable(f"ghana-nlp error: {translated.get('message')}")
    return translated or None


def _translate_google(text: str, target_language: str, source_language: str = "en") -> Optional[str]:
    """Local/free fallback via Google Translate (direct HTTP, no key needed)."""
    if not text:
        return text
    url = "https://translate.googleapis.com/translate_a/single"
    params = {
        "client": "gtx",
        "sl": _provider_lang(source_language),
        "tl": _provider_lang(target_language),
        "dt": "t",
        "q": text,
    }
    try:
        resp = requests.get(url, params=params, timeout=_PROVIDER_TIMEOUT)
    except Exception as exc:
        raise _ProviderUnavailable(f"google request failed: {exc}") from exc
    if resp.status_code in (403, 429):
        raise _ProviderUnavailable(f"google returned {resp.status_code}")
    if resp.status_code != 200:
        return None
    try:
        data = resp.json()
    except Exception:
        return None
    if not data or not data[0]:
        return None
    translated = "".join([item[0] for item in data[0] if item[0]])
    return translated or None


def _translate_mymemory(text: str, target_language: str, source_language: str = "en") -> Optional[str]:
    """Keyless translation via MyMemory Translation API."""
    if not text:
        return text
    try:
        resp = requests.get(
            "https://api.mymemory.translated.net/translate",
            params={"q": text, "langpair": f"{_provider_lang(source_language)}|{_provider_lang(target_language)}"},
            timeout=_PROVIDER_TIMEOUT,
        )
    except Exception as exc:
        raise _ProviderUnavailable(f"mymemory request failed: {exc}") from exc
    if resp.status_code in (403, 429):
        raise _ProviderUnavailable(f"mymemory returned {resp.status_code}")
    if resp.status_code != 200:
        return None
    try:
        data = resp.json()
    except Exception:
        return None
    translated = (data.get("response") or {}).get("translatedText") or ""
    return translated or None


def _translate_libretranslate(text: str, target_language: str, source_language: str = "en") -> Optional[str]:
    """Optional LibreTranslate instance (only used when one is configured)."""
    if not text:
        return text
    if not _LIBRETRANSLATE_URL:
        raise _ProviderUnavailable("no LibreTranslate instance configured")
    payload = {
        "q": text,
        "source": _provider_lang(source_language),
        "target": _provider_lang(target_language),
        "format": "text",
    }
    if _LIBRETRANSLATE_API_KEY:
        payload["api_key"] = _LIBRETRANSLATE_API_KEY
    try:
        resp = requests.post(f"{_LIBRETRANSLATE_URL}/translate", json=payload, timeout=_PROVIDER_TIMEOUT)
    except Exception as exc:
        raise _ProviderUnavailable(f"libretranslate request failed: {exc}") from exc
    if resp.status_code in (400, 401, 403, 429):
        raise _ProviderUnavailable(f"libretranslate returned {resp.status_code}")
    if resp.status_code != 200:
        return None
    try:
        data = resp.json()
    except Exception:
        return None
    return data.get("translatedText") or None


def _translate_one(text: str, language_pair: str) -> str:
    """Translate with a bounded, failure-tolerant provider chain.

    Every provider is guarded by a circuit breaker so an outage is only paid
    for once, and the total time spent per call is capped. The caller runs
    this off the event loop so a slow provider can never stall live messages.
    """
    source_lang, target_lang = language_pair.split("-", 1)
    if source_lang == target_lang:
        return text
    deadline = time.time() + _TRANSLATION_BUDGET
    providers = (
        ("ghana-nlp", _translate_ghana_nlp),
        ("google", _translate_google),
        ("mymemory", _translate_mymemory),
        ("libretranslate", _translate_libretranslate),
    )
    for name, provider in providers:
        if time.time() >= deadline:
            logger.info("[i18n] budget exhausted for %s, using offline fallback", language_pair)
            break
        if not _provider_ready(name, language_pair):
            continue
        try:
            translated = provider(text, target_lang, source_lang)
        except _ProviderUnavailable as exc:
            _disable_provider(name, language_pair)
            logger.warning("[i18n] %s unavailable for %s: %s", name, language_pair, exc)
            continue
        except Exception as exc:
            _disable_provider(name, language_pair)
            logger.warning("[i18n] %s failed for %s: %s", name, language_pair, exc)
            continue
        if translated and translated.strip() and translated.strip().lower() != text.strip().lower():
            return translated
    # Final fallback: local phrase dictionary (offline, instant)
    return _translate_phrase_dict(text, target_lang)


_TWI_PHRASE_DICT: Dict[str, str] = {
    "hello": "Yoo",
    "hi": "Yoo",
    "good morning": "Medaase awo",
    "good afternoon": "Medaase apɔse",
    "good evening": "Medaase adwo",
    "thank you": "Medaase pii",
    "thanks": "Medaase pii",
    "how are you": "De woh?",
    "i am fine": "Yie, medaase",
    "yes": "Yoo",
    "no": "Daabi",
    "please": "Mepɛ sɛ",
    "help": "Mepɛ sɛ mesiesie me",
    "help me": "Mepɛ sɛ mesiesie me",
    "what is your name": "Wo din de?",
    "my name is": "M din na",
    "where are you": "Wohɔ wo?",
    "i am from": "Me ti wɔ",
    "how much": "De dɛ?",
    "money": "Sika",
    "water": "Nsa",
    "food": "Asem",
    "goodbye": "Medaase pii",
    "see you later": "Hwɛ yie",
    "okay": "Yoo, mayɛ",
    "i understand": "Me tu am",
    "i do not understand": "Me tu am",
    "repeat": "Deɛn na wɔ hɔ?",
    "speak slowly": "Gyae wo asem",
    "thank you very much": "Medaase pii kakraa",
    "sorry": "Mepɛ sɛ dam",
    "excuse me": "Mepɛ sɛ dam",
    "network": "Nkwa",
    "internet": "Intanɛt",
    "data": "Data",
    "balance": "Balance",
    "phone": "Wofa",
    "call": "Sesa",
    "message": "Asɛm",
    "mobile money": "MoMo",
    "bank": "Bank",
    "account": "Account",
    "transfer": "Sesa",
    "deposit": "Depɔzit",
    "withdraw": "Wiɔdɔ",
    "problem": "Asɛm baako",
    "issue": "Asɛm baako",
    "help": "Mepɛ sɛ mesiesie me",
    "assistance": "Mepɛ sɛ mesiesie me",
    "support": "Mepɛ sɛ mesiesie me",
    "customer": "Customer",
    "agent": "Agent",
    "session": "Session",
    "case": "Case",
    "number": "Nomba",
    "name": "Din",
    "phone number": "Wofa nomba",
    "address": "Adrɛs",
    "location": "Adrɛs",
    "town": "Kuro",
    "city": "Kuro",
    "accra": "Nkran",
    "kumasi": "Kumase",
    "tamale": "Tamale",
}


def _translate_phrase_dict(text: str, target_lang: str) -> str:
    """Last-resort phrase dictionary for Twi."""
    if target_lang != "tw":
        return text
    key = text.strip().lower()
    if key in _TWI_PHRASE_DICT:
        return _TWI_PHRASE_DICT[key]
    # Try matching individual words
    words = re.findall(r'\w+', key)
    translated_words = []
    for word in words:
        translated_words.append(_TWI_PHRASE_DICT.get(word, word))
    if translated_words:
        return " ".join(translated_words)
    return text


def _load_translation_cache():
    global TRANSLATION_CACHE
    try:
        if os.path.exists(TRANSLATION_CACHE_PATH):
            with open(TRANSLATION_CACHE_PATH, "r", encoding="utf-8") as f:
                TRANSLATION_CACHE = json.load(f)
    except Exception:
        logger.exception("Failed to load translation cache")


def _save_translation_cache():
    try:
        with open(TRANSLATION_CACHE_PATH, "w", encoding="utf-8") as f:
            json.dump(TRANSLATION_CACHE, f, ensure_ascii=False, indent=2)
    except Exception:
        logger.exception("Failed to save translation cache")


_load_translation_cache()


def _translate_text(text: str, target_language: str, source_language: str = "en") -> str:
    if not text or not isinstance(text, str):
        return text
    cache_key = f"{source_language}->{target_language}:{text.lower()}"
    cached = TRANSLATION_CACHE.get(cache_key)
    if isinstance(cached, str) and cached:
        return cached
    try:
        translated = _translate_one(text, _get_language_pair(source_language, target_language))
        if not isinstance(translated, str) or not translated:
            return text
        if translated.strip().lower() == text.strip().lower():
            # A "translation" that is just the source text is not worth caching.
            return text
        TRANSLATION_CACHE[cache_key] = translated
        _save_translation_cache()
        return translated
    except Exception:
        logger.exception("Single translation failed for pair=%s", _get_language_pair(source_language, target_language))
        return text


async def _translate_text_async(text: str, target_language: str, source_language: str = "en") -> str:
    """Translate without blocking the event loop.

    Translation talks to third-party HTTP APIs, so it must never run inline
    in the websocket handler - a slow provider would stall every other
    message in the session.
    """
    if not text or not isinstance(text, str):
        return text
    try:
        return await asyncio.to_thread(_translate_text, text, target_language, source_language)
    except Exception:
        logger.exception("Async translation failed for %s->%s", source_language, target_language)
        return text


def _translate_batch(texts: List[str], target_language: str) -> List[str]:
    if not texts:
        return []
    try:
        translated = [
            _translate_one(item, _get_language_pair("en", target_language)) or item
            for item in texts
        ]
        return translated
    except Exception:
        logger.exception("Batch translation failed for target=%s", target_language)
        return texts


def _translate_tree_nodes(tree: Dict, target_language: str) -> Dict:
    texts = []
    text_map: Dict[str, int] = {}

    def collect(node: Dict):
        if "agent" in node and node["agent"] not in text_map:
            text_map[node["agent"]] = len(texts)
            texts.append(node["agent"])
        for option in node.get("options", []):
            label = option.get("label", "")
            if label and label not in text_map:
                text_map[label] = len(texts)
                texts.append(label)

    for node in tree.values():
        collect(node)

    translated_texts = _translate_batch(texts, target_language)
    result = {}
    for node_id, node in tree.items():
        new_node = dict(node)
        if "agent" in node:
            idx = text_map.get(node["agent"])
            if idx is not None and idx < len(translated_texts):
                new_node["agent"] = translated_texts[idx]
        if "options" in node:
            new_node["options"] = [
                {**option, "label": translated_texts[text_map[option["label"]]] if option.get("label") in text_map else option.get("label", "")}
                for option in node.get("options", [])
            ]
        result[node_id] = new_node
    return result


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "EchoText Ghana API", "version": "1.0.0"}


@app.get("/api/translation/status")
async def translation_status():
    """Report which translation backends are available."""
    primary_ok = HAS_TRANSLATOR and bool(os.getenv("KHAYA_API_KEY"))
    quota_active = {pair: _quota_active(pair) for pair in list(_QUOTA_HIT.keys())}
    fallback_ok = True
    return {
        "primary": "ghana-nlp",
        "primary_available": primary_ok,
        "fallback": "google",
        "fallback_url": "https://translate.googleapis.com",
        "fallback_available": fallback_ok,
        "quota_active": quota_active,
    }


@app.post("/api/translate/tree")
async def translate_conversation_tree(request: TranslationRequest):
    return {"tree": _translate_tree_nodes(request.tree, request.target_language)}


@app.post("/translate/customer-to-agent")
async def translate_customer_to_agent(request: TextTranslationRequest):
    if not request.text:
        raise HTTPException(status_code=400, detail="text is required")
    translated = _translate_text(request.text, target_language="en", source_language="tw")
    suggestions = _apply_language_mix(_match_suggestions(translated), "en", "translated")
    return {
        "translated_text": translated,
        "source_language": "tw",
        "target_language": "en",
        "suggested_replies": suggestions,
    }


@app.post("/translate/agent-to-customer")
async def translate_agent_to_customer(request: TextTranslationRequest):
    if not request.text:
        raise HTTPException(status_code=400, detail="text is required")
    translated = _translate_text(request.text, target_language="tw", source_language="en")
    suggestions = _pick_twi_suggestions(request.text)
    return {
        "translated_text": translated,
        "source_language": "en",
        "target_language": "tw",
        "suggested_replies": suggestions,
    }


@app.get("/api/qr/{counter_id}")
async def generate_qr(counter_id: str, request: Request, size: int = Query(10, ge=4, le=20)):
    host = request.headers.get("host", "")
    scheme = request.headers.get("x-forwarded-proto", "https")
    base_url = f"{scheme}://{host}/join" if host else f"{PUBLIC_BASE_URL}/join"
    qr_data = f"{base_url}/{counter_id}"
    if HAS_QRCODE:
        qr = qrcode_lib.QRCode(version=1, box_size=size, border=4)
        qr.add_data(qr_data)
        qr.make(fit=True)
        img = qr.make_image(fill_color="#1a1a2e", back_color="#ffffff")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)
        return StreamingResponse(buf, media_type="image/png")
    else:
        from PIL import Image, ImageDraw, ImageFont
        img = Image.new("RGB", (400, 400), color="#ffffff")
        draw = ImageDraw.Draw(img)
        try:
            font = ImageFont.truetype("arial.ttf", 20)
        except Exception:
            font = ImageFont.load_default()
        text = f"QR: {counter_id}\n{qr_data}"
        draw.multiline_text((20, 20), text, fill="#1a1a2e", font=font)
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)
        return StreamingResponse(buf, media_type="image/png")


@app.get("/api/qr-base64/{counter_id}")
async def generate_qr_base64(counter_id: str, request: Request, size: int = Query(10, ge=4, le=20)):
    host = request.headers.get("host", "")
    scheme = request.headers.get("x-forwarded-proto", "https")
    base_url = f"{scheme}://{host}/join" if host else f"{PUBLIC_BASE_URL}/join"
    qr_data = f"{base_url}/{counter_id}"
    if HAS_QRCODE:
        qr = qrcode_lib.QRCode(version=1, box_size=size, border=4)
        qr.add_data(qr_data)
        qr.make(fit=True)
        img = qr.make_image(fill_color="#1a1a2e", back_color="#ffffff")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        img_str = base64.b64encode(buf.getvalue()).decode()
        return {"qr_code": f"data:image/png;base64,{img_str}", "url": qr_data}
    else:
        from PIL import Image, ImageDraw, ImageFont
        img = Image.new("RGB", (400, 400), color="#ffffff")
        draw = ImageDraw.Draw(img)
        try:
            font = ImageFont.truetype("arial.ttf", 20)
        except Exception:
            font = ImageFont.load_default()
        text = f"QR: {counter_id}\n{qr_data}"
        draw.multiline_text((20, 20), text, fill="#1a1a2e", font=font)
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        img_str = base64.b64encode(buf.getvalue()).decode()
        return {"qr_code": f"data:image/png;base64,{img_str}", "url": qr_data, "fallback": True}


@app.post("/api/sms/send")
async def send_sms(request: SMSRequest):
    session_id = request.session_id or f"{request.case_number.lower()}_session"
    result = await manager.send_sms(session_id, request.phone_number, request.case_number, problem_summary=request.problem_summary, customer_profile=request.customer_profile, session_history=request.session_history)
    return result


@app.get("/api/session/{session_id}")
async def get_session(session_id: str):
    if session_id not in manager.sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    session = manager.sessions[session_id]
    session.case_summary = manager._compute_case_summary(session)
    return {
        "session_id": session.session_id,
        "counter_id": session.counter_id,
        "language": session.language,
        "status": session.status,
        "created_at": session.created_at,
        "transcript_count": len(session.transcripts),
        "cards": session.cards,
        "case_number": session.case_number,
        "sms_sent": session.sms_sent,
        "summary": {
            "total_turns": len(session.transcripts),
            "cards": len(session.cards),
            "case_summary": session.case_summary,
        },
    }


@app.get("/api/session/{session_id}/transcripts")
async def get_session_transcripts(session_id: str):
    if session_id not in manager.sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    session = manager.sessions[session_id]
    session.case_summary = manager._compute_case_summary(session)
    return {
        "session_id": session.session_id,
        "counter_id": session.counter_id,
        "language": session.language,
        "translation_mode": session.translation_mode,
        "transcripts": session.transcripts,
        "cards": session.cards,
        "case_summary": session.case_summary,
    }


@app.get("/api/session/{session_id}/case-summary")
async def get_session_case_summary(session_id: str):
    if session_id not in manager.sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    session = manager.sessions[session_id]
    session.case_summary = manager._compute_case_summary(session)
    return {
        "session_id": session.session_id,
        "case_summary": session.case_summary,
    }


@app.get("/api/session/{session_id}/metrics")
async def get_session_metrics(session_id: str):
    if session_id not in manager.sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    return {
        "session_id": session_id,
        "metrics": manager.get_session_metrics(session_id),
    }


@app.get("/api/supervisor/sessions")
async def list_sessions():
    active_sessions = []
    for session_id, session in manager.sessions.items():
        roles = list(manager.active_connections.get(session_id, {}).keys())
        case_summary = manager._compute_case_summary(session)
        active_sessions.append({
            "session_id": session_id,
            "counter_id": session.counter_id,
            "status": session.status,
            "language": session.language,
            "created_at": session.created_at,
            "roles": roles,
            "transcript_count": len(session.transcripts),
            "case_summary": case_summary,
            "metrics": manager.get_session_metrics(session_id),
        })
    active_sessions.sort(key=lambda s: s.get("created_at", ""), reverse=True)
    return {"sessions": active_sessions}


@app.post("/api/session/{session_id}/post-call-summary")
async def send_post_call_summary(session_id: str):
    if session_id not in manager.sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    result = await manager.send_post_call_summary(session_id)
    return result


class SuggestionRequest(BaseModel):
    text: str
    language: str = "en"
    context: Optional[str] = None
    mix: Optional[str] = None
    role: Optional[str] = "customer"


_AGENT_SUGGESTION_RULES: Dict[str, List[str]] = {
    "greeting": [
        "Hello! How can I help you today?",
        "Good day! Welcome to customer support.",
        "Hi there! How may I assist you?",
    ],
    "thanks": [
        "You're welcome! Have a great day.",
        "Glad I could help. Thank you for choosing us!",
        "Goodbye! Reach out if you need anything else.",
    ],
    "thank": [
        "You're welcome! Have a great day.",
        "Glad I could help. Thank you for choosing us!",
        "Goodbye! Reach out if you need anything else.",
    ],
    "bye": [
        "You're welcome! Have a great day.",
        "Glad I could help. Thank you for choosing us!",
        "Goodbye! Reach out if you need anything else.",
    ],
    "network": [
        "Please restart your device to refresh your connection.",
        "Let me check the network coverage in your area.",
        "Could you provide your location so I can check our towers?",
    ],
    "internet": [
        "Please restart your device to refresh your connection.",
        "Let me check the network coverage in your area.",
        "Could you provide your location so I can check our towers?",
    ],
    "data": [
        "Let me check your remaining data balance.",
        "Would you like to buy a new data bundle?",
        "Your current bundle expires in 2 days.",
    ],
    "bundle": [
        "Let me check your remaining data balance.",
        "Would you like to buy a new data bundle?",
        "Your current bundle expires in 2 days.",
    ],
    "mobile_money": [
        "Please do not share your MoMo PIN with anyone.",
        "Let me review your recent transaction history.",
        "I can help you reset your mobile money wallet.",
    ],
    "momo": [
        "Please do not share your MoMo PIN with anyone.",
        "Let me review your recent transaction history.",
        "I can help you reset your mobile money wallet.",
    ],
    "loan": [
        "I can help you check your loan eligibility.",
        "Your loan repayment is due next week.",
        "Would you like to apply for a micro-loan?",
    ],
    "credit": [
        "I can help you check your loan eligibility.",
        "Your loan repayment is due next week.",
        "Would you like to apply for a micro-loan?",
    ],
    "device": [
        "Please try restarting your phone.",
        "Is your SIM card working properly?",
        "Let me check your device IMEI status.",
    ],
    "phone": [
        "Please try restarting your phone.",
        "Is your SIM card working properly?",
        "Let me check your device IMEI status.",
    ],
    "sim": [
        "Please try restarting your phone.",
        "Is your SIM card working properly?",
        "Let me check your SIM activation status.",
    ],
    "card": [
        "Please try restarting your phone.",
        "Is your SIM card working properly?",
        "Let me check your SIM activation status.",
    ],
    "complaint": [
        "I'm sorry to hear about this issue.",
        "Let me escalate this to our technical team.",
        "Could you describe the exact problem?",
    ],
    "problem": [
        "I'm sorry to hear about this issue.",
        "Let me escalate this to our technical team.",
        "Could you describe the exact problem?",
    ],
    "issue": [
        "I'm sorry to hear about this issue.",
        "Let me escalate this to our technical team.",
        "Could you describe the exact problem?",
    ],
    "default": [
        "How can I help you?",
        "Please give me a moment to look into this.",
        "Could you provide more details?",
    ],
}


_CUSTOMER_SUGGESTION_RULES: Dict[str, List[str]] = {
    "greeting": [
        "I sent money to my sister but she did not recieve it",
        "I have a billing issue",
        "I need help with a transaction",
    ],
    "thanks": [
        "Thank you",
        "Thank you so much",
        "How do I track the refund?",
    ],
    "thank": [
        "Thank you",
        "Thank you so much",
        "How do I track the refund?",
    ],
    "bye": [
        "Thank you",
        "Thank you so much",
        "How do I track the refund?",
    ],
    "network": [
        "I have no signal",
        "My calls are dropping",
        "I cannot browse the internet",
    ],
    "internet": [
        "My internet is very slow",
        "I cannot browse the internet",
        "My data is not working",
    ],
    "data": [
        "I need more data",
        "My data finished too fast",
        "How do I buy a bundle?",
    ],
    "bundle": [
        "I need more data",
        "My data finished too fast",
        "How do I buy a bundle?",
    ],
    "mobile_money": [
        "I sent money but it did not arrive",
        "I was debited but did not receive the money",
        "Please reverse the MoMo transaction",
    ],
    "momo": [
        "I sent money but it did not arrive",
        "I was debited but did not receive the money",
        "Please reverse the MoMo transaction",
    ],
    "transfer": [
        "I made a transfer but it failed.",
        "The money did not reach the receiver.",
        "Can you check my transaction?",
    ],
    "transaction": [
        "I made a transfer but it failed.",
        "The money did not reach the receiver.",
        "Can you check my transaction?",
    ],
    "account": [
        "I cannot access my account.",
        "My account is locked.",
        "I need help logging in.",
    ],
    "balance": [
        "My balance is incorrect.",
        "I can't see my latest deposit.",
        "Please check my account balance.",
    ],
    "refund": [
        "I want a refund please.",
        "Is my money coming back?",
        "Yes, please reverse the payment.",
    ],
    "help": [
        "Yes, I need help please.",
        "Can you assist me?",
        "Please help me with this issue.",
    ],
    "default": [
        "I need help please",
        "Can you assist me?",
        "Please explain what to do next",
    ],
}



def _contains_sensitive_info(text: str) -> bool:
    cleaned = text.lower()
    sensitive_keywords = [
        "phone number", "password", "pin", "transaction id", "case number",
        "otp", "national id", "account number", "card number",
    ]
    if any(keyword in cleaned for keyword in sensitive_keywords):
        return True
    if re.search(r'\+233\s*\d{9}', cleaned) or re.search(r'0\d{9}', cleaned):
        return True
    if "txn" in cleaned or "transaction" in cleaned:
        return True
    return False


def _match_suggestions(text: str, role: str = "agent") -> List[str]:
    if _contains_sensitive_info(text):
        return []
    rules = _CUSTOMER_SUGGESTION_RULES if role == "customer" else _AGENT_SUGGESTION_RULES
    lower_text = text.lower()
    for keyword, suggestions in rules.items():
        if keyword != "default" and keyword in lower_text:
            return suggestions[:3]
    return rules["default"][:3]


_TWI_SUGGESTION_RULES: Dict[str, List[str]] = {
    "help you": [
        "Mepɛ sɛ mesiesie me nɛtwoɔko",
        "Me MoMo aka",
        "Mepɛ sɛ metɔ intanɛt data",
    ],
    "assist you": [
        "Mepɛ sɛ mesiesie me nɛtwoɔko",
        "Me MoMo aka",
        "Mepɛ sɛ metɔ intanɛt data",
    ],
    "name": [
        "Mepɛ sɛ mesiesie me nɛtwoɔko",
        "Me MoMo aka",
        "Mepɛ sɛ metɔ intanɛt data",
    ],
    "account": [
        "Mepɛ sɛ mesiesie me nɛtwoɔko",
        "Me MoMo aka",
        "Mepɛ sɛ metɔ intanɛt data",
    ],
    "location": [
        "Mewɔ Nkran",
        "Mewɔ Kumase",
        "Mewɔ Tamale",
    ],
    "stay": [
        "Mewɔ Nkran",
        "Mewɔ Kumase",
        "Mewɔ Tamale",
    ],
    "live": [
        "Mewɔ Nkran",
        "Mewɔ Kumase",
        "Mewɔ Tamale",
    ],
    "area": [
        "Mewɔ Nkran",
        "Mewɔ Kumase",
        "Mewɔ Tamale",
    ],
    "town": [
        "Mewɔ Nkran",
        "Mewɔ Kumase",
        "Mewɔ Tamale",
    ],
    "pin": [
        "Yoo, mayɛ",
        "Daabi, ɛnyɛ yie",
        "Kyerɛ me kwan bio",
    ],
    "confirm": [
        "Yoo, mayɛ",
        "Daabi, ɛnyɛ yie",
        "Kyerɛ me kwan bio",
    ],
    "code": [
        "Yoo, mayɛ",
        "Daabi, ɛnyɛ yie",
        "Kyerɛ me kwan bio",
    ],
    "send": [
        "Yoo, mayɛ",
        "Daabi, ɛnyɛ yie",
        "Kyerɛ me kwan bio",
    ],
    "okay": [
        "Yoo, mayɛ",
        "Daabi, ɛnyɛ yie",
        "Kyerɛ me kwan bio",
    ],
    "welcome": [
        "Medaase pii",
        "Yoo, nante yie",
        "Aane, asɛm baako bio",
    ],
    "goodbye": [
        "Medaase pii",
        "Yoo, nante yie",
        "Aane, asɛm baako bio",
    ],
    "day": [
        "Medaase pii",
        "Yoo, nante yie",
        "Aane, asɛm baako bio",
    ],
    "anything else": [
        "Medaase pii",
        "Yoo, nante yie",
        "Aane, asɛm baako bio",
    ],
    "default": [
        "Aane",
        "Daabi",
        "Mante aseɛ, firi aseɛ bio",
    ],
}


def _pick_twi_suggestions(text: str) -> List[str]:
    lower_text = text.lower()
    suggestions = next(
        (
            suggestions
            for keyword, suggestions in _TWI_SUGGESTION_RULES.items()
            if keyword != "default" and keyword in lower_text
        ),
        _TWI_SUGGESTION_RULES["default"],
    )
    return suggestions[:3]


def _apply_language_mix(suggestions: List[str], language: str, mode: str) -> List[str]:
    """Localize quick-reply chips.

    Uses the offline phrase dictionary on purpose: these are short UI chips
    and the network path used to fire three extra translator calls for every
    single message, which was the main source of the delivery lag.
    """
    if not suggestions:
        return []
    if mode == "dual":
        mixed = list(suggestions[:2])
        mixed.append(suggestions[2] if len(suggestions) > 2 else suggestions[0])
        mixed[-1] = _translate_phrase_dict(mixed[-1], "tw")
        return mixed
    if language == "tw" or mode == "tw":
        localized = [_translate_phrase_dict(item, "tw") for item in suggestions[:3]]
        return localized or suggestions[:3]
    return suggestions[:3]


@app.post("/api/suggestions")
async def get_suggestions(request: SuggestionRequest):
    text = (request.text or "").strip()
    if not text:
        return {"suggestions": [], "language": request.language or "en"}
    if request.language == "tw":
        matched = _pick_twi_suggestions(text)
        suggestions = matched[:3]
    else:
        matched = _match_suggestions(text, role=request.role or "customer")
        mode = request.mix or ("dual" if request.language == "tw" else "translated")
        suggestions = _apply_language_mix(matched, request.language or "en", mode)
    return {"suggestions": suggestions[:3], "language": request.language or "en"}


@app.post("/api/counter/validate-pin")
async def validate_counter_pin(request: Request):
    try:
        body = await request.json()
    except Exception:
        body = {}
    raw_counter_id = str(body.get("counter_id", "")).strip()
    pin = str(body.get("pin", "")).strip()
    counter_id = _normalize_counter_id(raw_counter_id)
    if not counter_id:
        raise HTTPException(status_code=404, detail="Counter not found")
    expected_pin = _get_counter_pin(counter_id)
    if not expected_pin:
        raise HTTPException(status_code=404, detail="Counter not found")
    if pin != expected_pin:
        raise HTTPException(status_code=401, detail="Invalid PIN")
    return {
        "valid": True,
        "counter_id": counter_id,
        "requested_counter_id": raw_counter_id,
        "known": counter_id in _known_counter_ids(),
        "pin": expected_pin,
    }


@app.get("/api/counter/{counter_id}/session")
async def get_or_create_counter_session(counter_id: str):
    normalized = _normalize_counter_id(counter_id)
    expected_pin = _get_counter_pin(normalized)
    if not expected_pin:
        raise HTTPException(status_code=404, detail="Counter not found")
    session_id = f"{normalized}_session"
    session = manager.sessions.get(session_id)
    if not session:
        session = manager.get_session(session_id)
    status = "active" if session_id in manager.active_connections else "waiting"
    return {
        "session_id": session_id,
        "counter_id": normalized,
        "status": status,
        "created_at": session.created_at if session else datetime.now(timezone.utc).isoformat(),
        "pin": expected_pin,
    }


@app.get("/api/sessions/active")
async def get_active_sessions():
    result = []
    for session_id, session in manager.sessions.items():
        connections = manager.active_connections.get(session_id, {})
        result.append({
            "session_id": session_id,
            "counter_id": session.counter_id,
            "status": "active" if connections else "waiting",
            "customer_connected": "customer" in connections,
            "agent_connected": "agent" in connections,
            "roles": list(connections.keys()),
            "created_at": session.created_at,
        })
    return {"sessions": result}


@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    language = websocket.query_params.get("language", "en")
    role = websocket.query_params.get("role", "customer")
    pin = websocket.query_params.get("pin", "")

    # Both sides must land in the same session, whatever spelling of the
    # counter id they used ("counter_1", "Counter 1", "1", ...).
    session_id = _normalize_counter_id(session_id)

    if role == "agent":
        counter_id = session_id
        if counter_id.endswith("_session"):
            counter_id = counter_id.removesuffix("_session")
        expected_pin = COUNTER_PIN_MAP.get(counter_id) or COUNTER_PIN_MAP.get(counter_id.upper())
        if not expected_pin or pin != expected_pin:
            logger.warning("[ws] agent rejected session=%s counter=%s reason=invalid_pin", session_id, counter_id)
            await websocket.close(code=4001, reason="Invalid PIN")
            return

    await manager.connect(session_id, websocket, role=role, language=language)
    try:
        session = manager.get_session(session_id)
        customer_language = session.language if session else "en"
        connected_payload = {
            "type": "connected",
            "session_id": session_id,
            "role": role,
            "message": f"Connected as {role}",
            "customer_language": customer_language if role == "agent" else None,
            "timestamp": int(time.time() * 1000),
        }
        if role == "agent" and session:
            connected_payload["case_summary"] = manager._compute_case_summary(session)
        connected_payload["customer_connected"] = "customer" in manager.active_connections.get(session_id, {})
        connected_payload["agent_connected"] = "agent" in manager.active_connections.get(session_id, {})
        await manager.send_json(session_id, connected_payload)
        await manager.broadcast_presence(session_id)

        transcription_task = None
        try:
            while True:
                data = await websocket.receive_text()
                try:
                    message = json.loads(data)
                    msg_type = message.get("type")
                    payload = message.get("data") or {}
                    logger.info("[ws] recv session=%s role=%s type=%s", session_id, role, msg_type)

                    if msg_type == "ping":
                        # Keep-alive: also tells the client the peer is here.
                        await manager.send_to_role(session_id, role, {
                            "type": "pong",
                            "timestamp": int(time.time() * 1000),
                        })
                        await manager.broadcast_presence(session_id)
                    elif msg_type == "response":
                        other_role = "agent" if role == "customer" else "customer"
                        text = payload.get("text", "")
                        speaker = role
                        session = manager.get_session(session_id)
                        customer_language = session.language if session else "en"
                        agent_language = session.agent_language if session else "en"
                        translation_mode = session.translation_mode if session else "translated"
                        spoken_language = language

                        # Work out up-front whether the receiver needs a
                        # translated copy. The transcript is always delivered
                        # immediately; the translation follows as an update.
                        translate_for_receiver = False
                        target_language = None
                        source_language = None
                        if role == "customer":
                            if customer_language != agent_language:
                                translate_for_receiver = True
                                target_language = agent_language
                                source_language = customer_language
                        else:
                            if translation_mode == "dual" or spoken_language != customer_language:
                                translate_for_receiver = True
                                target_language = customer_language
                                source_language = spoken_language

                        nlp_cards = []
                        if session and text.strip():
                            try:
                                nlp_result = manager.nlp.process(text.strip(), speaker)
                                if nlp_result.get("cards"):
                                    for card in nlp_result["cards"]:
                                        if card.get("value") not in [c.get("value") for c in session.cards]:
                                            session.cards.append(card)
                                    nlp_cards = nlp_result["cards"]
                            except Exception as exc:
                                logger.exception("[ws] nlp failed session=%s role=%s: %s", session_id, role, exc)
                        transcript_message = {
                            "type": "transcript",
                            "text": text,
                            "speaker": speaker,
                            "timestamp": payload.get("timestamp") or int(time.time() * 1000),
                            "is_final": True,
                            "translation_mode": translation_mode,
                            "original_text": None,
                            "cards": nlp_cards or None,
                        }
                        logger.info("[ws] forwarding transcript session=%s role=%s -> %s text=%r", session_id, role, other_role, text)
                        agent_suggestions = []
                        customer_suggestions = []
                        try:
                            if role == "customer" and other_role == "agent":
                                agent_suggestions = _apply_language_mix(_match_suggestions(text, role="agent"), agent_language, translation_mode)
                            elif role == "agent" and other_role == "customer":
                                customer_suggestions = _apply_language_mix(_match_suggestions(text, role="customer"), customer_language, translation_mode)
                        except Exception as exc:
                            logger.exception("[ws] suggestions failed session=%s role=%s: %s", session_id, role, exc)
                        forward_payload = {
                            "type": "transcript",
                            "text": text,
                            "speaker": speaker,
                            "timestamp": payload.get("timestamp") or int(time.time() * 1000),
                            "is_final": True,
                            "translation_mode": translation_mode,
                            "original_text": None,
                            "suggested_replies": agent_suggestions if other_role == "agent" else customer_suggestions,
                            "cards": nlp_cards or None,
                            "translation_pending": translate_for_receiver,
                        }
                        # Deliver the message first, translate afterwards. The
                        # receiver always gets the text immediately instead of
                        # waiting for a third-party translation API.
                        if session is not None:
                            session.transcripts.append(transcript_message)
                        await manager.deliver(session_id, other_role, forward_payload)
                        if translate_for_receiver:
                            asyncio.create_task(
                                manager.deliver_translation(
                                    session_id, other_role, forward_payload, text,
                                    target_language, source_language, role,
                                )
                            )
                        await manager.send_to_role(session_id, role, {
                            "type": "ack",
                            "message": "Response received",
                            "data": payload,
                            "timestamp": int(time.time() * 1000),
                        })
                        if session is not None:
                            try:
                                session.case_summary = manager._compute_case_summary(session)
                            except Exception as exc:
                                logger.exception("[ws] case summary failed session=%s: %s", session_id, exc)
                                session.case_summary = {}
                            manager.record_metric(session_id, "turns")
                            if role == "agent":
                                manager.record_metric(session_id, "agent_turns")
                            else:
                                manager.record_metric(session_id, "customer_turns")
                            if session.case_summary.get("status") == "escalated":
                                manager.record_metric(session_id, "escalations")
                            if session.case_summary.get("status") == "resolved":
                                manager.record_metric(session_id, "resolutions")
                            await manager.send_to_role(session_id, "agent", {
                                "type": "case_summary",
                                "case_summary": session.case_summary,
                                "timestamp": int(time.time() * 1000),
                            })
                            customer_summary = {
                                "case_number": session.case_summary.get("case_number"),
                                "stage": session.case_summary.get("stage"),
                                "problem_type": session.case_summary.get("problem_type"),
                                "problem_summary": session.case_summary.get("problem_summary") or session.case_summary.get("problem_label"),
                                "urgency": session.case_summary.get("urgency"),
                                "amount": session.case_summary.get("amount"),
                                "reference": session.case_summary.get("reference"),
                                "verified": session.case_summary.get("verified"),
                                "sms_sent": session.case_summary.get("sms_sent"),
                                "status": session.case_summary.get("status"),
                                "actions": session.case_summary.get("actions"),
                                "recommended_actions": session.case_summary.get("recommended_actions"),
                            }
                            await manager.send_to_role(session_id, "customer", {
                                "type": "case_summary",
                                "case_summary": customer_summary,
                                "timestamp": int(time.time() * 1000),
                            })
                    elif msg_type == "start_demo" and role == "customer":
                        if not transcription_task:
                            transcription_task = asyncio.create_task(manager.stream_transcription(session_id, language=language))
                    elif msg_type == "set_language" and role == "customer":
                        session = manager.get_session(session_id)
                        if session:
                            session.language = str(payload.get("language") or session.language).strip().lower()
                            await manager.send_to_role(session_id, "agent", {
                                "type": "customer_language",
                                "language": session.language,
                                "timestamp": int(time.time() * 1000),
                            })
                    elif msg_type == "set_mode" and role == "customer":
                        session = manager.get_session(session_id)
                        if session:
                            mode = str(payload.get("mode") or session.translation_mode).strip().lower()
                            if mode in ("original", "translated", "dual"):
                                session.translation_mode = mode
                    elif msg_type == "pause":
                        asr = manager.asr_instances.get(session_id)
                        if asr:
                            asr.stop()
                        await manager.send_json(session_id, {"type": "status", "status": "paused"})
                    elif msg_type == "resume":
                        asr = manager.asr_instances.get(session_id)
                        if asr:
                            asr.start()
                        await manager.send_json(session_id, {"type": "status", "status": "resumed"})
                    elif msg_type == "escalate":
                        if session:
                            try:
                                session.case_summary = manager._compute_case_summary(session)
                            except Exception as exc:
                                logger.exception("[ws] escalate case summary failed session=%s: %s", session_id, exc)
                                session.case_summary = {}
                            if "escalate" not in session.case_summary.get("actions", []):
                                session.case_summary.setdefault("actions", []).append("escalate")
                            session.case_summary["status"] = "escalated"
                            await manager.send_to_role(session_id, "agent", {
                                "type": "case_summary",
                                "case_summary": session.case_summary,
                                "timestamp": int(time.time() * 1000),
                             })
                        await manager.broadcast(session_id, {"type": "status", "status": "escalated"}, exclude_role=role)
                    elif msg_type == "request_sms":
                        phone = payload.get("phone_number") or "+233000000000"
                        case_number = payload.get("case_number") or session_id
                        problem_summary = payload.get("problem_summary")
                        customer_profile = payload.get("customer_profile")
                        session_history = payload.get("session_history")
                        await manager.send_sms(session_id, phone, case_number, problem_summary=problem_summary, customer_profile=customer_profile, session_history=session_history)
                        if session:
                            session.case_number = case_number
                            session.sms_sent = True
                            try:
                                session.case_summary = manager._compute_case_summary(session)
                            except Exception as exc:
                                logger.exception("[ws] sms case summary failed session=%s: %s", session_id, exc)
                                session.case_summary = {}
                            await manager.send_to_role(session_id, "agent", {
                                "type": "case_summary",
                                "case_summary": session.case_summary,
                                "timestamp": int(time.time() * 1000),
                            })
                    elif msg_type == "typing":
                        other_role = "agent" if role == "customer" else "customer"
                        await manager.send_to_role(session_id, other_role, {
                            "type": "typing",
                            "role": role,
                            "timestamp": int(time.time() * 1000),
                        })
                except json.JSONDecodeError:
                    pass
        except WebSocketDisconnect:
            pass
        except Exception as exc:
            logger.exception("[ws] session=%s role=%s unexpected error: %s", session_id, role, exc)
    finally:
        manager.disconnect(session_id, role)
        with suppress(Exception):
            await manager.broadcast_presence(session_id)
        if role == "customer":
            manager.asr_instances.pop(session_id, None)
        if transcription_task:
            transcription_task.cancel()


@app.get("/api/demo/conversation")
async def get_demo_conversation():
    return {"conversation": ASRSimulator().get_full_transcript()}


@app.get("/api/languages")
async def get_languages():
    return {
        "supported": [
            {"code": "en", "name": "English", "native": "English"},
            {"code": "tw", "name": "Twi", "native": "Twi"},
        ],
        "planned": [
            {"code": "ga", "name": "Ga", "native": "Ga"},
            {"code": "ee", "name": "Ewe", "native": "Eʋe"},
        ],
    }


@app.post("/asr/agent-speech")
async def asr_agent_speech(file: UploadFile = File(...), language: str = Form("en")):
    logger.info("[asr] request received filename=%s content_type=%s language=%s", file.filename, file.content_type, language)
    try:
        api_url = os.getenv("HCI_LAB_SPEECH_API_URL", "https://lab-subscription-platform.vercel.app/api/v1/asr").strip()
        token = os.getenv("HCI_LAB_SPEECH_TOKEN")
        if not token:
            raise HTTPException(status_code=500, detail="HCI Lab ASR token is not configured")
        audio_bytes = await file.read()
        files = {"file": (file.filename, audio_bytes, file.content_type or "application/octet-stream")}
        normalized_language = "tw" if str(language).lower() in ("tw", "twi") else "en"
        headers = {"Authorization": f"Bearer {token}"}
        data = {"language": normalized_language}
        logger.info("[asr] request filename=%s content_type=%s frontend_language=%s api_language=%s payload_keys=%s", file.filename, file.content_type, language, normalized_language, list(data.keys()))
        response = await asyncio.to_thread(
            requests.post, api_url, files=files, headers=headers, data=data, timeout=60
        )
        if response.status_code == 422:
            logger.error("ASR 422 response: %s", response.text)
            raise HTTPException(status_code=422, detail=f"ASR rejected audio: {response.text}")
        if response.status_code == 429:
            logger.error("ASR rate limited: %s", response.text)
            raise HTTPException(status_code=429, detail="ASR rate limited. Please try again shortly.")
        response.raise_for_status()
        try:
            result = response.json()
        except Exception:
            result = {"raw": response.text}
        transcript = ""
        if isinstance(result, dict):
            transcript = (
                result.get("transcript")
                or result.get("text")
                or result.get("transcription")
                or result.get("hypothesis")
                or result.get("result")
                or ""
            )
            if not transcript and "segments" in result:
                segments = result.get("segments", [])
                if isinstance(segments, list) and segments:
                    transcript = " ".join(
                        part.get("text") or part.get("transcript") or part.get("word", "")
                        for part in segments
                        if isinstance(part, dict)
                    ).strip()
            if not transcript and "words" in result:
                words = result.get("words", [])
                if isinstance(words, list) and words:
                    transcript = " ".join(
                        word.get("word") or word.get("text") or ""
                        for word in words
                        if isinstance(word, dict)
                    ).strip()
        logger.info("ASR response keys=%s transcript=%r", list(result.keys()) if isinstance(result, dict) else type(result).__name__, transcript)
        return {"transcript": transcript or "", "raw": result}
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("ASR request failed")
        raise HTTPException(status_code=500, detail=f"ASR failed: {exc}")


FRONTEND_DIST_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")


@app.get("/{full_path:path}")
async def serve_frontend_or_api(request: Request, full_path: str):
    if full_path.startswith("api/") or full_path.startswith("ws/") or full_path.startswith("docs/"):
        raise HTTPException(status_code=404, detail="Not found")
    frontend_file = os.path.join(FRONTEND_DIST_DIR, full_path)
    if full_path and os.path.isfile(frontend_file):
        return FileResponse(frontend_file)
    index_path = os.path.join(FRONTEND_DIST_DIR, "index.html")
    if os.path.isfile(index_path):
        return FileResponse(index_path)
    raise HTTPException(status_code=404, detail="Not found")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
