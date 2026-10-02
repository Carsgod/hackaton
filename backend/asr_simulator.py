import asyncio
import time
import random
from typing import List, Dict, Any, AsyncGenerator
from dataclasses import dataclass


@dataclass
class TranscriptSegment:
    text: str
    speaker: str
    start_time: float
    end_time: float
    confidence: float = 0.95
    is_final: bool = True


DEMO_CONVERSATION = [
    {"speaker": "agent", "text": "Good afternoon. Welcome to the MTN Service Centre. How may I assist you today?", "delay": 0.8},
    {"speaker": "customer", "text": "I sent 50 Ghana cedis to my sister yesterday, but she has not received the money. My MoMo wallet was debited.", "delay": 1.2},
    {"speaker": "agent", "text": "I'm sorry about that. Let me check the transaction status for you. Could you please provide the phone number you sent the money to?", "delay": 1.0},
    {"speaker": "customer", "text": "Yes. It was 0244656220.", "delay": 1.0},
    {"speaker": "agent", "text": "Thank you. I have located the transaction. The transaction reference is REF88321. It shows that GHS 50.00 was debited from your MoMo wallet on September 12 at 3:45 PM. The transaction is currently pending on the receiver's side.", "delay": 1.5},
    {"speaker": "customer", "text": "What should I do? Will the money be returned to my wallet?", "delay": 0.9},
    {"speaker": "agent", "text": "I can submit a reversal request for the transaction. The amount is GHS 50.00. Would you like me to proceed with the reversal?", "delay": 1.2},
    {"speaker": "customer", "text": "Yes, please. Proceed with the reversal.", "delay": 0.8},
    {"speaker": "agent", "text": "The reversal request has been submitted successfully. The GHS 50.00 will be returned to your MoMo wallet within 24 hours. Your case number is CASE45678. An SMS confirmation has been sent to your registered phone number ending in 90.", "delay": 1.4},
    {"speaker": "customer", "text": "Thank you very much. I can read everything on my screen. This is very helpful.", "delay": 1.0},
    {"speaker": "agent", "text": "You're welcome. If you need any further assistance, please contact MTN Customer Service. Have a great day.", "delay": 1.1},
]


DEMO_CONVERSATION_TWI = [
    {"speaker": "agent", "text": "Mema wo aha. Yɛma wo akwaaba wɔ MTN Service Centre. Ɛdeɛn na metumi aboa wo nnɛ?", "delay": 0.8},
    {"speaker": "customer", "text": "Mede Ghana cedis 50 kɔmaa me nuabea nnora, nanso ɔnnyaa sika no. Wɔbɔɔ me MoMo wallet no ka.", "delay": 1.2},
    {"speaker": "agent", "text": "Mepa wo kyɛw, meyɛ awerɛhow sɛ eyi ato wo. Ma menhwɛ transaction no na mahu nea asi. Wubetumi ama me telefon nɔma a wode kɔmaa sika no?", "delay": 1.0},
    {"speaker": "customer", "text": "Aane. Ɛyɛ 0244656220.", "delay": 1.0},
    {"speaker": "agent", "text": "Meda wo ase. Mahu transaction no. Transaction reference no yɛ REF88321. Ɛkyerɛ sɛ wɔbɔɔ wo MoMo wallet no GHS 50 ka wɔ September 12, 3:45 PM. Mprempren, transaction no da so retwɛn wɔ nea ogyee sika no nkyɛn.", "delay": 1.5},
    {"speaker": "customer", "text": "Dɛn na ɛsɛ sɛ meyɛ? Sika no bɛsan aba me wallet mu anaa?", "delay": 0.9},
    {"speaker": "agent", "text": "Metumi de reversal request akɔma ama transaction no. Sika no yɛ GHS 50. Wopɛ sɛ yɛyɛ reversal no?", "delay": 1.2},
    {"speaker": "customer", "text": "Aane, mesrɛ wo. Yɛ reversal no.", "delay": 0.8},
    {"speaker": "agent", "text": "Yɛde reversal request no akɔma. GHS 50 no bɛsan aba wo MoMo wallet mu wɔ nnɔnhwere 24 mu. Wo case number yɛ CASE45678. Yɛde SMS confirmation akɔ wo telefon nɔma a ɛba 90 so.", "delay": 1.4},
    {"speaker": "customer", "text": "Meda mo ase pii. Metumi akenkan biribiara a ɛwɔ me screen so. Eyi aboa me paa.", "delay": 1.0},
    {"speaker": "agent", "text": "Yɛma wo akwaaba. Sɛ wohia mmoa foforo biara a, yɛsrɛ wo, wo ne MTN Customer Service nni nkitaho. Da no nkɔ yie mma wo.", "delay": 1.1},
]


class ASRSimulator:
    def __init__(self, conversation: List[Dict] = None, language: str = "en"):
        if conversation is None:
            conversation = DEMO_CONVERSATION_TWI if language == "tw" else DEMO_CONVERSATION
        self.conversation = conversation
        self.is_running = False

    async def stream_conversation(self) -> AsyncGenerator[TranscriptSegment, None]:
        for turn in self.conversation:
            if not self.is_running:
                break
            words = turn["text"].split()
            base_time = time.time()
            for i, word in enumerate(words):
                if not self.is_running:
                    break
                partial = " ".join(words[: i + 1])
                yield TranscriptSegment(
                    text=partial,
                    speaker=turn["speaker"],
                    start_time=base_time + i * 0.20,
                    end_time=base_time + (i + 1) * 0.20,
                    confidence=random.uniform(0.88, 0.99),
                    is_final=(i == len(words) - 1),
                )
                await asyncio.sleep(0.20)
            await asyncio.sleep(turn.get("delay", 0.5))

    def start(self):
        self.is_running = True

    def stop(self):
        self.is_running = False

    def get_full_transcript(self) -> List[Dict[str, str]]:
        return [{"speaker": t["speaker"], "text": t["text"]} for t in self.conversation]

    def get_session_summary(self) -> Dict[str, Any]:
        return {
            "total_turns": len(self.conversation),
            "duration_estimate": sum(t.get("delay", 0.5) + len(t["text"].split()) * 0.12 for t in self.conversation),
            "speakers": list({t["speaker"] for t in self.conversation}),
        }
