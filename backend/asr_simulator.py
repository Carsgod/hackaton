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
    {"speaker": "agent", "text": "Good afternoon, welcome to MTN service center. How can I help you today?", "delay": 0.8},
    {"speaker": "customer", "text": "I sent fifty Ghana cedis to my sister yesterday but she didn't receive it. My account was debited.", "delay": 1.2},
    {"speaker": "agent", "text": "I'm sorry to hear that. Let me check the transaction for you. Can you tell me the phone number you sent to?", "delay": 1.0},
    {"speaker": "customer", "text": "Yes, it was zero two four four six five six two two zero.", "delay": 1.0},
    {"speaker": "agent", "text": "Thank you. I can see the transaction. Reference number is REF88321. It shows fifty Ghana cedis was debited from your account on September twelfth at three forty five PM. The transaction is currently pending on the receiver side.", "delay": 1.5},
    {"speaker": "customer", "text": "What should I do? Will the money come back?", "delay": 0.9},
    {"speaker": "agent", "text": "I can initiate a reversal for you. The amount is GHS fifty point zero zero. Do you approve the refund?", "delay": 1.2},
    {"speaker": "customer", "text": "Yes please, approve the refund.", "delay": 0.8},
    {"speaker": "agent", "text": "I have approved the refund. Your money will be returned to your mobile money wallet within twenty four hours. Your case number is CASE45678. An SMS confirmation has been sent to your phone number ending in nine zero.", "delay": 1.4},
    {"speaker": "customer", "text": "Thank you so much. I can read everything on my screen. This is very helpful.", "delay": 1.0},
    {"speaker": "agent", "text": "You're welcome. If you have any other issues, please don't hesitate to visit us. Have a great day.", "delay": 1.1},
]

DEMO_CONVERSATION_TWI = [
    {"speaker": "agent", "text": "Ahobrasee, akwaaba ba MTN service center no. Dɛn na metumi ayɛ wo nnɛ?", "delay": 0.8},
    {"speaker": "customer", "text": "Mɛtrɛɛ Ghana cedis ahahanu kɔɔ me nuabea nkyɛn nnora, na ɔnnyaa. Me account no bɔɔ me ka.", "delay": 1.2},
    {"speaker": "agent", "text": "Mente ase. Ma me hwɛ transaction no. Bɛtumi ka wo telefon number no a wokɔɔ hɔ no?", "delay": 1.0},
    {"speaker": "customer", "text": "Aane, na ɛyɛ zero two four four six five six two two zero.", "delay": 1.0},
    {"speaker": "agent", "text": "Medaase. Mɛ hu transaction no. Reference number yɛ REF88321. Ɛkyerɛ sɛ Ghana cedis ahahanu bɔɔ wo ka wɔ September twelfth, three forty five PM. Transaction no da so wɔ receiver nkyɛn.", "delay": 1.5},
    {"speaker": "customer", "text": "Dɛn na menyɛ? Sika no bɛsan aba?", "delay": 0.9},
    {"speaker": "agent", "text": "Metumi asan nkɔma wo. Sika no yɛ GHS fifty point zero zero. Wopɛ sɛ me ma refund?", "delay": 1.2},
    {"speaker": "customer", "text": "Aane, please ma me refund.", "delay": 0.8},
    {"speaker": "agent", "text": "Mɛma refund no. Wo sika bɛsan aba wo mobile money wallet mu wɔ nnɔnhwerehahanu mu. Wo case number yɛ CASE45678. SMS confirmation no akɔ wo telefon number a ɛwɔ nine zero no.", "delay": 1.4},
    {"speaker": "customer", "text": "Medaase pii. Metumi akenkan biribiara wɔ me screen so. Ɛyɛ hwee.", "delay": 1.0},
    {"speaker": "agent", "text": "Yɛ akyekyerɛ. Sɛ wo wɔ nsɛm foforo bi a, ɛnsɛ sɛ wo ho yɛ hu. Da biara wo nsa.", "delay": 1.1},
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
