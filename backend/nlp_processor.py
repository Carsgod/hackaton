import re
import json
from typing import List, Dict, Any
from dataclasses import dataclass, field, asdict


@dataclass
class Entity:
    type: str
    value: str
    display: str
    confidence: float = 1.0


class NLPProcessor:
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
        r"\btransaction(?:\s+(?:id|number|ref))?(?:\s+\w+){0,2}?\s*[:\s#]*([A-Z]{2,}[0-9]+|\d{4,})\b",
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
    ]

    def process(self, text: str, speaker: str = "agent") -> Dict[str, Any]:
        if not text:
            return {"entities": [], "cards": [], "summary": ""}
        entities = self._extract_entities(text)
        cards = self._build_cards(entities)
        summary = self._build_summary(text, speaker)
        return {"entities": entities, "cards": cards, "summary": summary}

    def _extract_entities(self, text: str) -> List[Dict[str, Any]]:
        entities: List[Dict[str, Any]] = []
        seen: set = set()
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
                    entities.append({"type": etype, "value": display, "raw": m.group(0), "confidence": 0.95})
        for pattern, action in self.ACTION_PATTERNS:
            for m in re.finditer(pattern, text, re.IGNORECASE):
                val = m.group(0).lower()
                key = ("action", val)
                if key not in seen:
                    seen.add(key)
                    entities.append({"type": "action", "value": action, "raw": val, "confidence": 0.9})
        return entities

    def _build_cards(self, entities: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        cards = []
        for idx, e in enumerate(entities):
            if e["type"] == "currency":
                cards.append({"id": f"card_amount_{idx}", "type": "amount", "label": "Amount", "value": e["value"], "icon": "💳", "priority": 1})
            elif e["type"] == "reference":
                cards.append({"id": f"card_ref_{idx}", "type": "reference", "label": "Reference", "value": e["value"], "icon": "🔢", "priority": 2})
            elif e["type"] == "phone":
                cards.append({"id": f"card_phone_{idx}", "type": "phone", "label": "Phone", "value": e["value"], "icon": "📱", "priority": 3})
            elif e["type"] == "action":
                cards.append({"id": f"card_action_{idx}", "type": "action", "label": "Action", "value": e["value"].title(), "icon": "✅", "priority": 4})
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
