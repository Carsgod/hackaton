import os
import asyncio
import json
import time
import random
import io
import base64
import logging
import requests
from typing import List, Dict, Optional, Any
from datetime import datetime, timezone
from contextlib import suppress
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query, Request, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from pydantic import BaseModel, Field

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

PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "https://echotext.gh").rstrip("/")
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "*").split(",")

COUNTER_PIN_MAP = {
    "counter_1": "1234",
    "counter_2": "5678",
    "counter_3": "9012",
}


def _get_counter_pin(counter_id: str) -> str:
    normalized = counter_id.strip()
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
            elif role == "agent":
                self.sessions[session_id].agent_language = language
        self.sessions[session_id].connected_at = time.time()
        logger.info("[ws] connect session=%s role=%s language=%s active_roles=%s", session_id, role, language, list(self.active_connections.get(session_id, {}).keys()))

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


def _get_translator():
    if not HAS_TRANSLATOR:
        raise RuntimeError("ghana-nlp is not installed")
    api_key = os.getenv("KHAYA_API_KEY")
    if not api_key:
        raise RuntimeError("KHAYA_API_KEY is not set")
    return GhanaNLP(api_key=api_key)


def _translate_one(text: str, language_pair: str) -> str:
    translator = _get_translator()
    translated = translator.translate(text=text, language_pair=language_pair)
    return translated or text


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
    if not text:
        return text
    cache_key = f"{source_language}->{target_language}:{text.lower()}"
    cached = TRANSLATION_CACHE.get(cache_key)
    if cached is not None:
        return cached
    try:
        translated = _translate_one(text, _get_language_pair(source_language, target_language))
        if not translated:
            return text
        TRANSLATION_CACHE[cache_key] = translated
        _save_translation_cache()
        return translated
    except Exception:
        logger.exception("Single translation failed for pair=%s", _get_language_pair(source_language, target_language))
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


import re

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
    if not suggestions:
        return []
    if mode == "dual":
        mixed = suggestions[:2]
        if len(suggestions) > 2:
            mixed.append(suggestions[2])
        else:
            mixed.append(suggestions[0])
        try:
            translated = _translate_batch([mixed[-1]], "tw")
            mixed[-1] = translated[0] if translated and translated[0] else mixed[-1]
        except Exception:
            pass
        return mixed
    if language == "tw" or mode == "tw":
        try:
            return _translate_batch(suggestions[:3], "tw") or suggestions[:3]
        except Exception:
            return suggestions[:3]
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
    counter_id = str(body.get("counter_id", "")).strip()
    pin = str(body.get("pin", "")).strip()
    expected_pin = _get_counter_pin(counter_id)
    if not expected_pin:
        raise HTTPException(status_code=404, detail="Counter not found")
    if pin != expected_pin:
        raise HTTPException(status_code=401, detail="Invalid PIN")
    return {"valid": True, "counter_id": counter_id, "pin": expected_pin}


@app.get("/api/counter/{counter_id}/session")
async def get_or_create_counter_session(counter_id: str):
    normalized = counter_id.strip()
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
        is_active = session_id in manager.active_connections
        result.append({
            "session_id": session_id,
            "counter_id": session.counter_id,
            "status": "active" if is_active else "waiting",
            "created_at": session.created_at,
        })
    return {"sessions": result}


@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    language = websocket.query_params.get("language", "en")
    role = websocket.query_params.get("role", "customer")
    pin = websocket.query_params.get("pin", "")

    if role == "agent":
        counter_id = session_id
        if counter_id.endswith("_session"):
            counter_id = counter_id.removesuffix("_session")
        expected_pin = COUNTER_PIN_MAP.get(counter_id) or COUNTER_PIN_MAP.get(counter_id.upper())
        if not expected_pin or pin != expected_pin:
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
        if role == "agent" and session and session.transcripts:
            connected_payload["transcripts"] = session.transcripts
            connected_payload["cards"] = session.cards
            connected_payload["case_summary"] = manager._compute_case_summary(session)
        await manager.send_json(session_id, connected_payload)

        transcription_task = None
        try:
            while True:
                data = await websocket.receive_text()
                try:
                    message = json.loads(data)
                    msg_type = message.get("type")
                    payload = message.get("data") or {}
                    logger.info("[ws] recv session=%s role=%s type=%s", session_id, role, msg_type)

                    if msg_type == "response":
                        other_role = "agent" if role == "customer" else "customer"
                        text = payload.get("text", "")
                        speaker = role
                        session = manager.get_session(session_id)
                        customer_language = session.language if session else "en"
                        agent_language = session.agent_language if session else "en"
                        translation_mode = session.translation_mode if session else "translated"
                        customer_facing_text = text
                        agent_facing_text = text
                        original_for_customer = None
                        if role == "customer":
                            if customer_language != agent_language:
                                agent_facing_text = _translate_text(text, agent_language, source_language=customer_language)
                        elif role == "agent":
                            spoken_language = language
                            if translation_mode == "dual":
                                if spoken_language != customer_language:
                                    customer_facing_text = _translate_text(text, customer_language, source_language=spoken_language)
                                original_for_customer = text
                            else:
                                if spoken_language != customer_language:
                                    customer_facing_text = _translate_text(text, customer_language, source_language=spoken_language)
                        forward_text = agent_facing_text if other_role == "agent" else customer_facing_text
                        nlp_cards = []
                        if session and text.strip():
                            nlp_result = manager.nlp.process(text.strip(), speaker)
                            if nlp_result.get("cards"):
                                for card in nlp_result["cards"]:
                                    if card.get("value") not in [c.get("value") for c in session.cards]:
                                        session.cards.append(card)
                                nlp_cards = nlp_result["cards"]
                        transcript_message = {
                            "type": "transcript",
                            "text": forward_text,
                            "speaker": speaker,
                            "timestamp": payload.get("timestamp") or int(time.time() * 1000),
                            "is_final": True,
                            "translation_mode": translation_mode,
                            "original_text": original_for_customer if role == "agent" else None,
                            "cards": nlp_cards or None,
                        }
                        logger.info("[ws] forwarding transcript session=%s role=%s -> %s text=%r", session_id, role, other_role, forward_text)
                        agent_suggestions = []
                        customer_suggestions = []
                        if role == "customer" and other_role == "agent":
                            agent_suggestions = _apply_language_mix(_match_suggestions(agent_facing_text, role="agent"), agent_language, translation_mode)
                        elif role == "agent" and other_role == "customer":
                            customer_suggestions = _apply_language_mix(_match_suggestions(customer_facing_text, role="customer"), customer_language, translation_mode)
                        forward_payload = {
                            "type": "transcript",
                            "text": forward_text,
                            "speaker": speaker,
                            "timestamp": payload.get("timestamp") or int(time.time() * 1000),
                            "is_final": True,
                            "translation_mode": translation_mode,
                            "original_text": original_for_customer if role == "agent" else None,
                            "suggested_replies": agent_suggestions if other_role == "agent" else customer_suggestions,
                            "cards": nlp_cards or None,
                        }
                        target_ws = manager.active_connections.get(session_id, {}).get(other_role)
                        if target_ws:
                            try:
                                await target_ws.send_json(forward_payload)
                            except Exception as exc:
                                logger.exception("[ws] forward failed session=%s role=%s: %s", session_id, other_role, exc)
                                await manager.broadcast(session_id, forward_payload, exclude_role=role)
                        else:
                            logger.warning("[ws] target role %s not found for session %s, broadcasting to all except sender", other_role, session_id)
                            await manager.broadcast(session_id, forward_payload, exclude_role=role)
                        await manager.send_to_role(session_id, role, {
                            "type": "ack",
                            "message": "Response received",
                            "data": payload,
                            "timestamp": int(time.time() * 1000),
                        })
                        if session is not None:
                            session.transcripts.append(transcript_message)
                            session.case_summary = manager._compute_case_summary(session)
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
                            session.case_summary = manager._compute_case_summary(session)
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
                            session.case_summary = manager._compute_case_summary(session)
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
                        await manager.broadcast(session_id, {"type": "status", "status": "ended"}, exclude_role=role)
                        try:
                            post_call = await manager.send_post_call_summary(session_id)
                            await manager.send_to_role(session_id, "agent", {
                                "type": "post_call_summary",
                                "data": post_call,
                                "timestamp": int(time.time() * 1000),
                            })
                            await manager.send_to_role(session_id, "customer", {
                                "type": "post_call_summary",
                                "data": post_call,
                                "timestamp": int(time.time() * 1000),
                            })
                        except Exception:
                            pass
                except json.JSONDecodeError:
                    pass
        except WebSocketDisconnect:
            pass
    finally:
        manager.disconnect(session_id, role)
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
        data = {"language": normalized_language}
        headers = {"Authorization": f"Bearer {token}"}
        logger.info("[asr] request filename=%s content_type=%s frontend_language=%s api_language=%s", file.filename, file.content_type, language, normalized_language)
        response = requests.post(api_url, files=files, headers=headers, data=data, timeout=60)
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
