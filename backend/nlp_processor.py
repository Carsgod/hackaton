import re
import json
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field, asdict


@dataclass
class Entity:
    type: str
    value: str
    display: str
    confidence: float = 1.0
    context: Optional[str] = None


@dataclass
class CaseSummary:
    case_number: Optional[str] = None
    problem_type: str = "general inquiry"
    problem_label: str = "General Inquiry"
    amount: Optional[str] = None
    currency: str = "GHS"
    reference: Optional[str] = None
    phone: Optional[str] = None
    recipient: Optional[str] = None
    transaction_date: Optional[str] = None
    transaction_time: Optional[str] = None
    status: str = "open"
    resolution: Optional[str] = None
    actions: List[str] = field(default_factory=list)
    urgency: str = "normal"
    customer_name: Optional[str] = None
    national_id: Optional[str] = None
    account_type: Optional[str] = None
    subscription: Optional[str] = None
    bonus: Optional[str] = None
    escalation_ref: Optional[str] = None
    sms_sent: bool = False
    verified: bool = False
    turns: int = 0
    language: str = "en"
    raw_transcript: List[Dict[str, str]] = field(default_factory=list)
    stage: str = "greeting"
    confidence: float = 0.5
    deduced_at: str = ""
    fraud_risk: str = "low"
    fraud_indicators: List[str] = field(default_factory=list)
    recommended_actions: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        data = asdict(self)
        data["problem_summary"] = self.problem_type.replace("_", " ").title()
        return data


class LiveDialogueState:
    def __init__(self):
        self.stage = "greeting"
        self.extracted_amount = None
        self.extracted_reference = None
        self.extracted_phone = None
        self.extracted_case_number = None
        self.extracted_name = None
        self.extracted_national_id = None
        self.extracted_date = None
        self.extracted_time = None
        self.extracted_recipient = None
        self.extracted_account_type = None
        self.extracted_subscription = None
        self.extracted_bonus = None
        self.extracted_escalation_ref = None
        self.actions_detected = set()
        self.urgency_score = 0.0
        self.question_answer_pairs = []
        self.last_agent_question = None
        self.last_customer_answer = None
        self.entities_by_type = {}
        self.verification_complete = False
        self.refund_approved = False
        self.sms_sent = False
        self.turns_without_update = 0
        self.confidence = 0.5
        self.fraud_risk_score = 0.0
        self.fraud_indicators = []
        self.recommended_actions = []
        self.problem_type = "general inquiry"

    def update(self, speaker: str, text: str, entities: List[Dict[str, Any]]) -> None:
        self.turns_without_update = 0
        text_lower = text.lower().strip()
        detected_stage = self.stage
        if self._is_greeting(text):
            detected_stage = "greeting"
        elif self._is_verification(text):
            detected_stage = "verification"
        elif self._is_problem_identification(text):
            detected_stage = "problem_identification"
        elif self._is_solution(text):
            detected_stage = "solution"
        elif self._is_resolution(text):
            detected_stage = "resolution"
        elif self._is_closing(text):
            detected_stage = "closing"
        stage_order = ["greeting", "verification", "problem_identification", "solution", "resolution", "closing"]
        current_idx = stage_order.index(self.stage) if self.stage in stage_order else 0
        new_idx = stage_order.index(detected_stage) if detected_stage in stage_order else 0
        if new_idx >= current_idx:
            self.stage = detected_stage

            if self._check_refund_approval(text):
                self.refund_approved = True
            if self._check_sms_sent(text):
                self.sms_sent = True
            if self._check_verification_complete(text):
                self.verification_complete = True
        else:
            self.last_customer_answer = text
            if self.last_agent_question:
                self.question_answer_pairs.append({
                    "question": self.last_agent_question,
                    "answer": text,
                    "timestamp": ""
                })
                self.last_agent_question = None

        self._extract_entities_from_turn(entities)
        self._update_urgency(text_lower)
        self._update_problem_type(text_lower, speaker)
        self._update_fraud_risk(text_lower, speaker)
        self._update_recommended_actions(text_lower, speaker)
        self.confidence = min(1.0, self.confidence + 0.1)

    def _extract_question(self, text: str) -> Optional[str]:
        question_patterns = [
            r"(?:can you|could you|would you|do you|did you|have you|are you|is there|are there|what|when|where|who|why|how)\s+[^?]*\?",
            r"[^.]*\?"
        ]
        for pattern in question_patterns:
            m = re.search(pattern, text, re.IGNORECASE)
            if m:
                return m.group(0).strip()
        return None

    def _is_greeting(self, text: str) -> bool:
        greeting_patterns = [
            r"\b(?:good afternoon|good morning|good evening)\b",
            r"\b(?:welcome\s+to\s+(?:mtn|the|our))\b",
            r"\b(?:hello|hi\s+there|hi\s+you|dear\s+customer)\b",
            r"\b(?:how can i help|how may i assist|what can i do for you)\b"
        ]
        return any(re.search(p, text, re.IGNORECASE) for p in greeting_patterns)

    def _is_verification(self, text: str) -> bool:
        verification_patterns = [
            r"\b(?:verify|verification|confirm your identity|confirm your phone|national id|passport)\b",
            r"\b(?:can you confirm|please confirm|i need to verify)\b"
        ]
        return any(re.search(p, text, re.IGNORECASE) for p in verification_patterns)

    def _is_problem_identification(self, text: str) -> bool:
        problem_patterns = [
            r"\b(?:what seems to be the issue|what type of billing|which transaction|what is the problem)\b",
            r"\b(?:how can i assist|what seems to be)\b"
        ]
        return any(re.search(p, text, re.IGNORECASE) for p in problem_patterns)

    def _is_solution(self, text: str) -> bool:
        solution_patterns = [
            r"\b(?:i can initiate|i can submit|i will process|i have located|i can see)\b",
            r"\b(?:reversal|refund|adjustment|deactivate|escalate)\b"
        ]
        return any(re.search(p, text, re.IGNORECASE) for p in solution_patterns)

    def _is_resolution(self, text: str) -> bool:
        resolution_patterns = [
            r"\b(?:i have approved|i have processed|the reversal has|your money will be returned)\b",
            r"\b(?:case number is|sms confirmation)\b"
        ]
        return any(re.search(p, text, re.IGNORECASE) for p in resolution_patterns)

    def _is_closing(self, text: str) -> bool:
        closing_patterns = [
            r"\b(?:you're welcome|have a great day|is there anything else|thank you for choosing)\b",
            r"\b(?:if you need any further assistance)\b"
        ]
        return any(re.search(p, text, re.IGNORECASE) for p in closing_patterns)

    def _check_refund_approval(self, text: str) -> bool:
        approval_patterns = [
            r"\b(?:i have approved|i've approved|approved the refund|approved the reversal)\b",
            r"\b(?:reversal request has been submitted|refund has been processed)\b"
        ]
        return any(re.search(p, text, re.IGNORECASE) for p in approval_patterns)

    def _check_sms_sent(self, text: str) -> bool:
        sms_patterns = [
            r"\b(?:sms confirmation has been sent|sms has been sent|confirmation sent)\b",
            r"\b(?:you will receive an sms|an sms)\b"
        ]
        return any(re.search(p, text, re.IGNORECASE) for p in sms_patterns)

    def _check_verification_complete(self, text: str) -> bool:
        verification_patterns = [
            r"\b(?:your identity has been verified|identity verified|verification complete)\b",
            r"\b(?:thank you for verifying)\b"
        ]
        return any(re.search(p, text, re.IGNORECASE) for p in verification_patterns)

    def _extract_entities_from_turn(self, entities: List[Dict[str, Any]]) -> None:
        for entity in entities:
            etype = entity.get("type")
            value = entity.get("value")
            if not etype or not value:
                continue
            if etype not in self.entities_by_type:
                self.entities_by_type[etype] = []
            if value not in [e["value"] for e in self.entities_by_type[etype]]:
                self.entities_by_type[etype].append(entity)
            if etype == "amount" and not self.extracted_amount:
                self.extracted_amount = value
            elif etype == "reference" and not self.extracted_reference:
                self.extracted_reference = value
            elif etype == "phone":
                if not self.extracted_phone:
                    self.extracted_phone = value
            elif etype == "case_number" and not self.extracted_case_number:
                self.extracted_case_number = value
            elif etype == "name" and not self.extracted_name:
                self.extracted_name = value
            elif etype == "national_id" and not self.extracted_national_id:
                self.extracted_national_id = value

    def _update_urgency(self, text_lower: str) -> None:
        high_urgency = [
            "urgent", "immediately", "asap", "right now", "emergency", "critical",
            "very important", "as soon as possible", "right away"
        ]
        medium_urgency = ["today", "soon", "quickly", "fast", "please help", "need help"]

        if any(p in text_lower for p in high_urgency):
            self.urgency_score = max(self.urgency_score, 1.0)
        elif any(p in text_lower for p in medium_urgency):
            self.urgency_score = max(self.urgency_score, 0.6)
        elif self.urgency_score > 0:
            self.urgency_score = max(0.0, self.urgency_score - 0.1)

    def _update_problem_type(self, text_lower: str, speaker: str) -> None:
        if speaker != "customer":
            return
        problem_indicators = {
            "momo_refund": [
                "sent money", "mo mo", "mobile money", "not received", "debited",
                "pending on the receiver", "reversal", "money to my sister", "mo mo transfer"
            ],
            "billing_overcharge": [
                "overcharge", "incorrect balance", "billing", "airtime overcharge",
                "data charge", "subscription", "charged incorrectly"
            ],
            "billing_vas": [
                "unrecognized", "value added", "vas", "subscription", "auto-renewal",
                "automated charges", "unknown service"
            ],
            "transaction_error": [
                "transaction error", "failed transaction", "incorrect amount",
                "unauthorized deduction", "transaction failed"
            ],
            "account_access": [
                "can't access", "cannot access", "locked", "pin reset",
                "reset my pin", "account locked", "login issue"
            ],
            "balance_inquiry": [
                "balance is incorrect", "pending debit", "balance", "wrong balance"
            ],
            "unauthorized_charge": [
                "unauthorized charge", "flagged", "investigate", "unknown charge",
                "suspicious charge"
            ],
        }
        for problem_type, keywords in problem_indicators.items():
            if any(k in text_lower for k in keywords):
                self.problem_type = problem_type
                self.confidence = min(1.0, self.confidence + 0.2)
                break

    def _update_fraud_risk(self, text_lower: str, speaker: str) -> None:
        if speaker != "customer":
            return
        risk_indicators = {
            "high": [
                "send money now", "do not tell anyone", "account has been compromised",
                "otp", "one time password", "share your pin", "transfer immediately",
                "urgent payment", "account will be blocked", "suspicious login"
            ],
            "medium": [
                "unknown caller", "asked for password", "strange request",
                "unusual transaction", "locked out", "verify your identity again"
            ]
        }
        detected = []
        for level, indicators in risk_indicators.items():
            matches = [indicator for indicator in indicators if indicator in text_lower]
            if matches:
                detected.extend(matches)
                if level == "high":
                    self.fraud_risk_score = min(1.0, self.fraud_risk_score + 0.4)
                else:
                    self.fraud_risk_score = min(1.0, self.fraud_risk_score + 0.2)
        if detected:
            self.fraud_indicators.extend(detected)
            self.fraud_indicators = list(dict.fromkeys(self.fraud_indicators))

    def _update_recommended_actions(self, text_lower: str, speaker: str) -> None:
        if speaker != "agent":
            return
        recommendations = {
            "momo_refund": [
                "Verify customer identity before discussing transaction details.",
                "Confirm the exact amount and recipient.",
                "Initiate reversal only after customer confirmation."
            ],
            "billing_overcharge": [
                "Review recent billing history before approving adjustments.",
                "Confirm the billed amount with the customer.",
                "Process adjustment only if overcharge is confirmed."
            ],
            "unauthorized_charge": [
                "Do not disclose full transaction details over chat.",
                "Verify customer identity with registered details.",
                "Flag the transaction for investigation."
            ],
            "account_access": [
                "Verify identity before resetting credentials.",
                "Use only official channels for PIN resets.",
                "Warn customer against sharing OTPs."
            ]
        }
        for problem_type, actions in recommendations.items():
            if self.problem_type == problem_type:
                for action in actions:
                    if action not in self.recommended_actions:
                        self.recommended_actions.append(action)
                break


class SmartNLPProcessor:
    CURRENCY_PATTERNS = [
        (r"(?:GHS\s+)?(fifty|twenty|fifteen|one hundred|five hundred)\s+Ghana\s+cedis", "currency"),
        (r"(?:GHS|Ghana\s+cedis?|cedis?)\s*(\d+(?:\.\d{1,2})?)", "currency"),
        (r"(\d+(?:\.\d{1,2})?)\s*(?:GHS|Ghana\s+cedis?|cedis?)", "currency"),
        (r"(\d+(?:\.\d{1,2})?)\s*(?:cedis?|ghana\s+cedi)", "currency"),
    ]
    REFERENCE_PATTERNS = [
        r"\breference(?:\s+(?:number|no|#|num))?(?:\s+\w+){0,2}?\s*[:\s#]*([A-Z]{2,}[0-9]+|\d{4,})\b",
        r"\bcase(?:\s+(?:number|no|#|id))?(?:\s+\w+){0,2}?\s*[:\s#]*([A-Z]{2,}[0-9]+|\d{4,})\b",
        r"\bticket(?:\s+(?:number|no|#|id))?(?:\s+\w+){0,2}?\s*[:\s#]*([A-Za-z]{2,}[0-9]+|\d{4,})\b",
        r"\btransaction(?:\s+(?:id|number|ref))?(?:\s+\w+){0,2}?\s*[:\s#]*([A-Za-z]{2,}[0-9]+|\d{4,})\b",
        r"#(\d{4,12})\b",
    ]
    PHONE_PATTERNS = [
        r"0(?:23|24|25|26|27|28|29|30|31|32|33|34|35|36|37|38|39|50|51|52|53|54|55|56|57|58|59|60|61|62|63|64|65|66|67|68|69|70|71|72|73|74|75|76|77|78|79|80|81|82|83|84|85|86|87|88|89|90|91|92|93|94|95|96|97)\d{7}",
        r"\+233(?:23|24|25|26|27|28|29|30|31|32|33|34|35|36|37|38|39|50|51|52|53|54|55|56|57|58|59|60|61|62|63|64|65|66|67|68|69|70|71|72|73|74|75|76|77|78|79|80|81|82|83|84|85|86|87|88|89|90|91|92|93|94|95|96|97)\d{7}",
    ]
    ACTION_PATTERNS = [
        (r"\b(refund|reversal|reversed|returned)\b", "refund"),
        (r"\b(approve[d]?\s+(?:the\s+)?(?:refund|transaction|payment|reversal))\b", "approve"),
        (r"\b(approve)\b", "approve"),
        (r"\b(escalate[d]?\s+(?:the\s+)?(?:issue|case|matter))\b", "escalate"),
        (r"\b(escalate)\b", "escalate"),
        (r"\b(cancel[l]?\s+(?:the\s+)?(?:transaction|payment|order|service))\b", "cancel"),
        (r"\b(cancel)\b", "cancel"),
        (r"\b(verify|verified|verification)\b", "verify"),
        (r"\b(confirm|confirmed|confirmation)\b", "confirm"),
        (r"\b(renew|renewed|renewal)\b", "renew"),
        (r"\b(suspend|suspended|suspension)\b", "suspend"),
        (r"\b(activate|activated|activation)\b", "activate"),
        (r"\b(deactivate[d]?\s+(?:the\s+)?(?:subscription|service|auto-renewal))\b", "deactivate"),
        (r"\b(deactivate)\b", "deactivate"),
        (r"\b(flag[ged]?\s+(?:the\s+)?(?:charge|transaction|issue|case))\b", "flag"),
        (r"\b(investigate)\b", "investigate"),
    ]
    PROBLEM_INDICATORS = {
        "momo_refund": [
            "sent money", "mo mo", "mobile money", "not received", "debited",
            "pending on the receiver", "reversal", "money to my sister", "mo mo transfer",
            "wallet was debited", "money sent"
        ],
        "billing_overcharge": [
            "overcharge", "incorrect balance", "billing", "airtime overcharge",
            "data charge", "subscription", "charged incorrectly", "balance is incorrect"
        ],
        "billing_vas": [
            "unrecognized", "value added", "vas", "subscription", "auto-renewal",
            "automated charges", "unknown service", "didn't sign up"
        ],
        "transaction_error": [
            "transaction error", "failed transaction", "incorrect amount",
            "unauthorized deduction", "transaction failed", "payment error"
        ],
        "account_access": [
            "can't access", "cannot access", "locked", "pin reset",
            "reset my pin", "account locked", "login issue", "access my account"
        ],
        "balance_inquiry": [
            "balance is incorrect", "pending debit", "balance", "wrong balance",
            "my balance"
        ],
        "unauthorized_charge": [
            "unauthorized charge", "flagged", "investigate", "unknown charge",
            "suspicious charge", "charge i didn't make"
        ],
    }
    URGENCY_INDICATORS = {
        "high": [
            "urgent", "immediately", "asap", "right now", "emergency", "critical",
            "very important", "as soon as possible", "right away", "please help urgently"
        ],
        "medium": [
            "today", "soon", "quickly", "fast", "please help", "need help",
            "as soon as", "quick"
        ],
    }
    DATE_PATTERNS = [
        r"\b(?:on\s+)?(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?\b",
        r"\b(?:on\s+)?\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?(?:January|February|March|April|May|June|July|August|September|October|November|December)\b",
        r"\b(?:on\s+)?(?:Sep|Sept|Oct|Nov|Dec|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?\b",
        r"\b(?:on\s+)?\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?(?:Sep|Sept|Oct|Nov|Dec|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug)[a-z]*\.?\b",
        r"\b(?:on\s+)?(?:today|yesterday|tomorrow)\b",
        r"\b(?:on\s+)?(?:September\s+twelfth|September\s+12)\b",
    ]
    TIME_PATTERNS = [
        r"\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM|am|pm)?\b",
        r"\b\d{1,2}\s+(?:o'clock)?\s*(?:in the\s+)?(?:morning|afternoon|evening|night)\b",
        r"\b(?:three forty five|3:45)\s*(?:PM|AM|am|pm)?\b",
    ]
    NAME_PATTERNS = [
        r"\b(?:my\s+name\s+is|i\s+am|i'm|this\s+is)\s+([A-Z][a-z]{1,}(?:\s+[A-Z][a-z]{1,}){0,2})\b",
    ]
    NAME_STOPWORDS = {
        "going", "looking", "trying", "needing", "calling", "speaking", "writing",
        "sending", "receiving", "having", "getting", "making", "doing", "saying",
        "telling", "asking", "using", "getting", "someone", "anyone", "everyone",
        "something", "anything", "everything", "nothing", "somebody", "anybody",
        "the", "a", "an", "my", "your", "his", "her", "our", "their", "this",
        "that", "these", "those", "what", "which", "who", "whom", "whose",
        "there", "here", "now", "today", "yesterday", "tomorrow", "soon",
        "please", "thank", "sorry", "hello", "hi", "yes", "no", "okay", "ok",
    }
    ID_PATTERNS = [
        r"\b(GHA-[A-Z0-9-]+)\b",
        r"\b([A-Z]{3}-\d{9}-\d)\b",
    ]
    COREFERENCE_PATTERNS = {
        "recipient": [
            r"(?:to\s+my\s+(?:sister|brother|friend|wife|husband|mother|father|aunt|uncle|cousin))",
            r"(?:recipient|receiver|the\s+person\s+i\s+sent\s+to)",
            r"\b(?:she|he|them|they)\b(?:\s+(?:has|have|didn't|hasn't|haven't)\s+receive)?",
        ],
        "transaction": [
            r"\b(?:the\s+transaction|that\s+transaction|this\s+transaction|the\s+money|the\s+funds)\b",
            r"\b(?:it|that|this)\s+(?:was|is|shows|pending|failed)\b",
        ],
        "issue": [
            r"\b(?:the\s+issue|this\s+problem|that\s+problem|the\s+situation)\b",
        ]
    }

    def __init__(self):
        self.dialogue_state = LiveDialogueState()
        self.entity_memory = {}
        self.context_window = []
        self.max_context = 20

    def process(self, text: str, speaker: str = "agent") -> Dict[str, Any]:
        if not text:
            return {"entities": [], "cards": [], "summary": ""}
        entities = self._extract_entities(text, speaker)
        self._update_context(text, speaker)
        self.dialogue_state.update(speaker, text, entities)
        cards = self._build_cards(entities)
        summary = self._build_summary(text, speaker)
        return {"entities": entities, "cards": cards, "summary": summary}

    def _extract_entities(self, text: str, speaker: str) -> List[Dict[str, Any]]:
        entities = []
        seen = set()
        all_patterns = (
            self.CURRENCY_PATTERNS
            + list(zip(self.REFERENCE_PATTERNS, ["reference"] * len(self.REFERENCE_PATTERNS)))
            + list(zip(self.PHONE_PATTERNS, ["phone"] * len(self.PHONE_PATTERNS)))
        )
        for pattern, etype in all_patterns:
            for m in re.finditer(pattern, text, re.IGNORECASE):
                val = m.group(1) if m.lastindex else m.group(0)
                if etype == "currency":
                    raw = m.group(0)
                    if re.search(r'ghana\s+cedis', raw, re.IGNORECASE):
                        display = raw.replace('GHS', '').replace('ghs', '').strip()
                    else:
                        display = f"GHS {val}"
                else:
                    display = val
                key = (etype, display)
                if key not in seen:
                    seen.add(key)
                    context = self._get_entity_context(text, m.start(), m.end())
                    entities.append({
                        "type": etype,
                        "value": display,
                        "raw": m.group(0),
                        "confidence": self._calculate_confidence(etype, context, speaker),
                        "context": context
                    })
        for pattern, action in self.ACTION_PATTERNS:
            for m in re.finditer(pattern, text, re.IGNORECASE):
                val = m.group(0).lower()
                key = ("action", val)
                if key not in seen:
                    seen.add(key)
                    entities.append({
                        "type": "action",
                        "value": action,
                        "raw": val,
                        "confidence": 0.9 if speaker == "agent" else 0.7
                    })
        self._apply_coreference_resolution(entities, text, speaker)
        if speaker == "customer":
            self._extract_names(text, entities)
        return entities

    def _extract_names(self, text: str, entities: List[Dict[str, Any]]) -> None:
        for pattern in self.NAME_PATTERNS:
            m = re.search(pattern, text, re.IGNORECASE)
            if not m:
                continue
            name = m.group(1).strip().title() if m.lastindex else m.group(0).strip().title()
            first = name.split()[0].lower()
            if len(name) < 2 or first in self.NAME_STOPWORDS:
                continue
            if any(e["type"] == "name" and e["value"].lower() == name.lower() for e in entities):
                continue
            entities.append({
                "type": "name",
                "value": name,
                "raw": m.group(0),
                "confidence": 0.9,
                "context": self._get_entity_context(text, m.start(), m.end()),
            })
            break

    def _get_entity_context(self, text: str, start: int, end: int, window: int = 50) -> str:
        context_start = max(0, start - window)
        context_end = min(len(text), end + window)
        return text[context_start:context_end].strip()

    def _calculate_confidence(self, entity_type: str, context: str, speaker: str) -> float:
        base_confidence = 0.95 if speaker == "agent" else 0.85
        if entity_type == "reference":
            if re.search(r"(?:reference|case|ticket|transaction)\s+(?:number|id|#)", context, re.IGNORECASE):
                return 0.98
        elif entity_type == "phone":
            if re.search(r"(?:phone|number|contact)", context, re.IGNORECASE):
                return 0.97
        elif entity_type == "currency":
            if re.search(r"(?:ghana\s+cedis|ghs|cedis)", context, re.IGNORECASE):
                return 0.96
        return base_confidence

    def _apply_coreference_resolution(self, entities: List[Dict[str, Any]], text: str, speaker: str) -> None:
        text_lower = text.lower()
        for entity_type, patterns in self.COREFERENCE_PATTERNS.items():
            for pattern in patterns:
                if re.search(pattern, text_lower, re.IGNORECASE):
                    if entity_type == "recipient":
                        phone_matches = re.findall(r"0\d{9}", text)
                        if phone_matches:
                            entities.append({
                                "type": "recipient_phone",
                                "value": phone_matches[-1],
                                "raw": phone_matches[-1],
                                "confidence": 0.75,
                                "context": "coreference: recipient"
                            })
                    elif entity_type == "transaction":
                        ref_matches = re.findall(r"\b(?:REF|TXN|CASE)[A-Z0-9]+\b", text, re.IGNORECASE)
                        if ref_matches and not any(e["type"] == "reference" for e in entities):
                            entities.append({
                                "type": "reference",
                                "value": ref_matches[0],
                                "raw": ref_matches[0],
                                "confidence": 0.8,
                                "context": "coreference: transaction"
                            })

    def _update_context(self, text: str, speaker: str) -> None:
        self.context_window.append({"speaker": speaker, "text": text})
        if len(self.context_window) > self.max_context:
            self.context_window.pop(0)

    def _build_cards(self, entities: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        cards = []
        priority_map = {
            "amount": 1,
            "reference": 2,
            "phone": 3,
            "case_number": 4,
            "action": 5,
            "name": 6,
            "national_id": 7,
        }
        for idx, e in enumerate(entities):
            etype = e.get("type")
            if etype == "currency":
                cards.append({
                    "id": f"card_amount_{idx}",
                    "type": "amount",
                    "label": "Amount",
                    "value": e["value"],
                    "icon": "💳",
                    "priority": priority_map.get("amount", 10),
                    "confidence": e.get("confidence"),
                    "context": e.get("context"),
                })
            elif etype == "reference":
                cards.append({
                    "id": f"card_ref_{idx}",
                    "type": "reference",
                    "label": "Reference",
                    "value": e["value"],
                    "icon": "🔢",
                    "priority": priority_map.get("reference", 10),
                    "confidence": e.get("confidence"),
                    "context": e.get("context"),
                })
            elif etype == "phone":
                cards.append({
                    "id": f"card_phone_{idx}",
                    "type": "phone",
                    "label": "Phone",
                    "value": e["value"],
                    "icon": "📱",
                    "priority": priority_map.get("phone", 10),
                    "confidence": e.get("confidence"),
                    "context": e.get("context"),
                })
            elif etype == "action":
                cards.append({
                    "id": f"card_action_{idx}",
                    "type": "action",
                    "label": "Action",
                    "value": e["value"].title(),
                    "icon": "✅",
                    "priority": priority_map.get("action", 10),
                    "confidence": e.get("confidence"),
                    "context": e.get("context"),
                })
        cards.sort(key=lambda c: c["priority"])
        return cards

    def _build_summary(self, text: str, speaker: str) -> str:
        label = "Agent" if speaker == "agent" else "You"
        return f"[{label}] {text}"

    def process_transcript(self, segments: List[Dict[str, str]]) -> List[Dict[str, Any]]:
        all_entities = []
        all_cards = []
        for seg in segments:
            result = self.process(seg.get("text", ""), seg.get("speaker", "agent"))
            all_entities.extend(result["entities"])
            all_cards.extend(result["cards"])
        unique_cards = {c["value"]: c for c in all_cards}
        return list(unique_cards.values())

    def build_case_summary(self, transcripts: List[Dict[str, Any]], session: Optional[Dict[str, Any]] = None) -> CaseSummary:
        summary = CaseSummary()
        if session:
            summary.case_number = session.get("case_number") or session.get("session_id")
            summary.language = session.get("language", "en")
            summary.sms_sent = bool(session.get("sms_sent"))
        summary.raw_transcript = [{"speaker": t.get("speaker", ""), "text": t.get("text", "")} for t in transcripts]
        summary.turns = len(transcripts)

        if transcripts:
            self.dialogue_state = LiveDialogueState()
            for turn in transcripts:
                speaker = turn.get("speaker", "agent")
                text = turn.get("text", "")
                entities = self._extract_entities(text, speaker)
                self._update_context(text, speaker)
                self.dialogue_state.update(speaker, text, entities)

        ds = self.dialogue_state
        summary.stage = ds.stage
        summary.confidence = ds.confidence

        if ds.extracted_amount:
            summary.amount = ds.extracted_amount
        if ds.extracted_reference:
            summary.reference = ds.extracted_reference
        if ds.extracted_phone:
            summary.phone = ds.extracted_phone
        if ds.extracted_case_number:
            summary.case_number = ds.extracted_case_number
        if ds.extracted_name:
            summary.customer_name = ds.extracted_name
        if ds.extracted_national_id:
            summary.national_id = ds.extracted_national_id
        if ds.extracted_date:
            summary.transaction_date = ds.extracted_date
        if ds.extracted_time:
            summary.transaction_time = ds.extracted_time
        if ds.extracted_recipient:
            summary.recipient = ds.extracted_recipient
        if ds.extracted_account_type:
            summary.account_type = ds.extracted_account_type
        if ds.extracted_subscription:
            summary.subscription = ds.extracted_subscription
        if ds.extracted_bonus:
            summary.bonus = ds.extracted_bonus
        if ds.extracted_escalation_ref:
            summary.escalation_ref = ds.extracted_escalation_ref

        summary.problem_type = ds.problem_type if hasattr(ds, 'problem_type') and ds.problem_type else "general inquiry"
        summary.problem_label = summary.problem_type.replace("_", " ").title()

        all_text = " ".join(t.get("text", "") for t in transcripts).lower()
        customer_texts = " ".join(t.get("text", "") for t in transcripts if t.get("speaker") == "customer").lower()
        agent_texts = " ".join(t.get("text", "") for t in transcripts if t.get("speaker") == "agent")
        combined_text_original = " ".join(t.get("text", "") for t in transcripts)
        agent_texts_lower = agent_texts.lower()

        if summary.problem_type == "general inquiry":
            scored_problems = []
            for problem_type, keywords in self.PROBLEM_INDICATORS.items():
                score = sum(1 for k in keywords if k in all_text)
                if score > 0:
                    scored_problems.append((score, problem_type))
            if scored_problems:
                scored_problems.sort(key=lambda x: x[0], reverse=True)
                summary.problem_type = scored_problems[0][1]
                summary.problem_label = summary.problem_type.replace("_", " ").title()

        for pattern in self.REFERENCE_PATTERNS:
            matches = re.findall(pattern, combined_text_original, re.IGNORECASE)
            if matches:
                summary.reference = matches[0] if isinstance(matches[0], str) else matches[0][0] if matches[0] else None
                if summary.reference and not summary.case_number:
                    summary.case_number = summary.reference
                break

        for pattern in self.PHONE_PATTERNS:
            m = re.search(pattern, combined_text_original)
            if m:
                summary.phone = m.group(0)
                break

        for pattern in self.NAME_PATTERNS:
            m = re.search(pattern, customer_texts, re.IGNORECASE)
            if m:
                name = m.group(1) if m.lastindex else m.group(0)
                name = name.strip().title()
                first = name.split()[0].lower() if name else ""
                if len(name) >= 2 and first not in self.NAME_STOPWORDS:
                    summary.customer_name = name
                    break

        for pattern in self.ID_PATTERNS:
            m = re.search(pattern, combined_text_original, re.IGNORECASE)
            if m:
                summary.national_id = m.group(1) if m.lastindex else m.group(0)
                break

        case_match = re.search(r"\bcase(?:\s+(?:number|no|#|id))?(?:\s+\w+){0,2}?\s*[:\s#]*([A-Z]{2,}[0-9]+|\d{4,})\b", agent_texts, re.IGNORECASE)
        if case_match:
            summary.case_number = case_match.group(1)

        if not summary.case_number:
            session_case = None
            if session:
                session_case = session.get("case_number") or session.get("session_id")
            if session_case:
                summary.case_number = session_case

        for pattern, _ in self.CURRENCY_PATTERNS:
            m = re.search(pattern, combined_text_original, re.IGNORECASE)
            if m:
                raw = m.group(0)
                if re.search(r'ghana\s+cedis', raw, re.IGNORECASE):
                    summary.amount = raw.replace('GHS', '').replace('ghs', '').strip()
                    summary.currency = "Ghana cedis"
                else:
                    val = m.group(1) if m.lastindex else m.group(0)
                    summary.amount = f"GHS {val}"
                break

        for pattern in self.DATE_PATTERNS:
            m = re.search(pattern, combined_text_original, re.IGNORECASE)
            if m:
                summary.transaction_date = m.group(0).strip()
                break

        for pattern in self.TIME_PATTERNS:
            m = re.search(pattern, combined_text_original, re.IGNORECASE)
            if m:
                summary.transaction_time = m.group(0).strip()
                break

        recipient_match = re.search(
            r"(?:to\s+my\s+(?:sister|brother|friend|wife|husband|mother|father|aunt|uncle|cousin))",
            combined_text_original, re.IGNORECASE
        )
        if recipient_match:
            summary.recipient = recipient_match.group(0).replace("to my", "to").strip()
        phone_matches = re.findall(r"0\d{9}", combined_text_original)
        if len(phone_matches) > 1:
            summary.recipient = phone_matches[-1]
            if not summary.phone:
                summary.phone = phone_matches[0]

        if "prepaid" in all_text:
            summary.account_type = "prepaid"
        elif "postpaid" in all_text:
            summary.account_type = "postpaid"

        sub_match = re.search(r"(?:subscription|service)\s+(?:is\s+)?([a-z0-9\s]+?)(?:\s+to\s+|\s+and\s+|\s+\.)", all_text, re.IGNORECASE)
        if sub_match:
            summary.subscription = sub_match.group(1).strip()
        if "auto-renewal" in all_text or "automatic renewal" in all_text:
            summary.subscription = "auto-renewal"

        bonus_match = re.search(r"(?:goodwill\s+)?(?:data\s+)?bonus\s+(?:of\s+)?(\w+(?:\s+\w+)?)\s*(?:megabytes|mb|gb)?", all_text, re.IGNORECASE)
        if bonus_match:
            summary.bonus = bonus_match.group(0).strip()
        if "five hundred megabytes" in all_text:
            summary.bonus = "500 MB data bonus"
        elif "goodwill data bonus" in all_text:
            summary.bonus = "goodwill data bonus"

        escalation_match = re.search(r"escalation\s+reference\s+is\s+([A-Z0-9]+)", combined_text_original, re.IGNORECASE)
        if escalation_match:
            summary.escalation_ref = escalation_match.group(1)

        for pattern, action in self.ACTION_PATTERNS:
            for m in re.finditer(pattern, combined_text_original, re.IGNORECASE):
                if action not in summary.actions:
                    summary.actions.append(action)

        if "approved" in agent_texts_lower or "approve" in agent_texts_lower:
            if "approve" not in summary.actions:
                summary.actions.append("approve")
        if "sms confirmation" in agent_texts_lower or "sms" in agent_texts_lower:
            summary.sms_sent = True
        if "verified" in agent_texts_lower or "verification" in agent_texts_lower:
            summary.verified = True

        if summary.actions:
            summary.resolution = ", ".join(summary.actions).title()

        if "refund" in summary.actions or "approve" in summary.actions:
            summary.status = "resolved"
        elif "deactivate" in summary.actions:
            summary.status = "resolved"
        elif "escalate" in summary.actions:
            summary.status = "escalated"
        elif "flag" in summary.actions or "investigate" in summary.actions:
            summary.status = "investigating"
        elif "cancel" in summary.actions:
            summary.status = "cancelled"
        elif "verify" in summary.actions:
            summary.status = "verification_pending"
        elif ds.stage in ("solution", "resolution"):
            summary.status = "in_progress"

        if ds.urgency_score >= 1.0:
            summary.urgency = "high"
        elif ds.urgency_score >= 0.6:
            summary.urgency = "medium"
        else:
            summary.urgency = "normal"

        if ds.fraud_risk_score >= 0.7:
            summary.fraud_risk = "high"
        elif ds.fraud_risk_score >= 0.3:
            summary.fraud_risk = "medium"
        else:
            summary.fraud_risk = "low"
        summary.fraud_indicators = ds.fraud_indicators[:10]
        summary.recommended_actions = ds.recommended_actions[:5]

        from datetime import datetime
        summary.deduced_at = datetime.utcnow().isoformat()
        return summary
