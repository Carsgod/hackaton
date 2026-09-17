import asyncio
import json
import uuid
import time
import random
import io
import base64
import logging
from typing import List, Dict, Optional
from datetime import datetime
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

logger = logging.getLogger("echotext")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

try:
    import qrcode as qrcode_lib
    HAS_QRCODE = True
except ImportError:
    HAS_QRCODE = False

from asr_simulator import ASRSimulator, TranscriptSegment
from nlp_processor import NLPProcessor


app = FastAPI(title="EchoText Ghana API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class Session(BaseModel):
    session_id: str
    counter_id: str
    customer_name: Optional[str] = None
    language: str = "en"
    status: str = "active"
    created_at: str
    transcripts: List[Dict] = []
    cards: List[Dict] = []
    connected_at: float = 0


class SMSRequest(BaseModel):
    phone_number: str
    message: str
    case_number: str
    session_id: Optional[str] = None


class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.sessions: Dict[str, Session] = {}
        self.asr_instances: Dict[str, ASRSimulator] = {}
        self.nlp = NLPProcessor()

    async def connect(self, session_id: str, websocket: WebSocket, language: str = "en"):
        await websocket.accept()
        self.active_connections[session_id] = websocket
        self.sessions.setdefault(session_id, Session(
            session_id=session_id,
            counter_id=session_id.split("_")[0] if "_" in session_id else session_id,
            created_at=datetime.utcnow().isoformat(),
            language=language,
        ))
        self.sessions[session_id].connected_at = time.time()

    def disconnect(self, session_id: str):
        if session_id in self.active_connections:
            del self.active_connections[session_id]

    async def send_json(self, session_id: str, data: dict):
        if session_id in self.active_connections:
            await self.active_connections[session_id].send_json(data)

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
                    "timestamp": datetime.utcnow().isoformat(),
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
                await self.send_json(session_id, seg_dict)
        except Exception as exc:
            logger.exception("stream_transcription error for %s: %s", session_id, exc)
        finally:
            asr.stop()
            await self.send_json(session_id, {"type": "status", "status": "ended", "message": "Transcription session ended"})

    async def send_sms(self, session_id: str, phone_number: str, case_number: str) -> Dict:
        session = self.sessions.get(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        message = (
            f"EchoText Ghana: Your support case {case_number} has been confirmed. "
            f"Your refund of GHS 50.00 has been approved. "
            f"Funds will arrive within 24 hours. Session ID: {session_id}"
        )
        sms_record = {
            "to": phone_number,
            "message": message,
            "case_number": case_number,
            "status": "delivered",
            "timestamp": datetime.utcnow().isoformat(),
            "provider": "EchoText SMS Gateway (Simulated)",
        }
        await self.send_json(session_id, {"type": "sms", "data": sms_record})
        return sms_record


manager = ConnectionManager()


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "EchoText Ghana API", "version": "1.0.0"}


@app.get("/api/qr/{counter_id}")
async def generate_qr(counter_id: str, size: int = Query(10, ge=4, le=20)):
    base_url = "https://echotext.gh/join"
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
async def generate_qr_base64(counter_id: str, size: int = Query(10, ge=4, le=20)):
    base_url = "https://echotext.gh/join"
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
    result = await manager.send_sms(session_id, request.phone_number, request.case_number)
    return result


@app.get("/api/session/{session_id}")
async def get_session(session_id: str):
    if session_id not in manager.sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    session = manager.sessions[session_id]
    return {
        "session_id": session.session_id,
        "counter_id": session.counter_id,
        "language": session.language,
        "status": session.status,
        "created_at": session.created_at,
        "transcript_count": len(session.transcripts),
        "cards": session.cards,
        "summary": manager.asr.get_session_summary(),
    }


@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    language = websocket.query_params.get("language", "en")
    await manager.connect(session_id, websocket, language=language)
    await manager.send_json(session_id, {
        "type": "connected",
        "session_id": session_id,
        "message": "Connected to EchoText live transcription",
        "timestamp": datetime.utcnow().isoformat(),
    })
    transcription_task = asyncio.create_task(manager.stream_transcription(session_id, language=language))
    try:
        while True:
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
                if message.get("type") == "response":
                    await manager.send_json(session_id, {
                        "type": "ack",
                        "message": "Response received",
                        "data": message.get("data"),
                        "timestamp": datetime.utcnow().isoformat(),
                    })
                elif message.get("type") == "pause":
                    asr = manager.asr_instances.get(session_id)
                    if asr:
                        asr.stop()
                    await manager.send_json(session_id, {"type": "status", "status": "paused"})
                elif message.get("type") == "resume":
                    asr = manager.asr_instances.get(session_id)
                    if asr:
                        asr.start()
                    await manager.send_json(session_id, {"type": "status", "status": "resumed"})
                elif message.get("type") == "request_sms":
                    data = message.get("data") or {}
                    phone = data.get("phone_number") or "+233000000000"
                    case_number = data.get("case_number") or session_id
                    await manager.send_sms(session_id, phone, case_number)
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(session_id)
        manager.asr_instances.pop(session_id, None)
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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
