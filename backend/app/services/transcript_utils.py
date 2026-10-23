"""Deterministic transcript extraction and hashing — never invents text."""
from __future__ import annotations

import hashlib
import json
import re
from typing import Any


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip().lower())


def extract_usable_text(source_type: str, payload: dict, transcript_payload: dict | None) -> str | None:
    """Usable supplied text: nonblank call transcript OR ≥1 nonblank meeting turn."""
    if source_type == "call":
        t = (payload or {}).get("transcript")
        if isinstance(t, str) and t.strip():
            return t.strip()
        return None
    if source_type == "meeting":
        turns = (transcript_payload or {}).get("turns") if transcript_payload else None
        if not isinstance(turns, list):
            return None
        parts = [str(x.get("text") or "").strip() for x in turns if str(x.get("text") or "").strip()]
        if not parts:
            return None
        return "\n".join(parts)
    return None


def content_hash(source_type: str, payload: dict, transcript_payload: dict | None) -> str | None:
    text = extract_usable_text(source_type, payload, transcript_payload)
    if not text:
        return None
    return hashlib.sha256(normalize_text(text).encode("utf-8")).hexdigest()


def meeting_turns(transcript_payload: dict | None) -> list[dict]:
    if not transcript_payload:
        return []
    turns = transcript_payload.get("turns") or []
    return turns if isinstance(turns, list) else []


def find_quote_in_transcript(
    quote: str,
    source_type: str,
    payload: dict,
    transcript_payload: dict | None,
) -> dict[str, Any]:
    """Locate exact or normalized quote. Never invents a match."""
    if not quote or not str(quote).strip():
        return {"found": False, "reason": "Empty evidence quote", "turn_number": None, "speaker": None}

    q_norm = normalize_text(quote)
    if source_type == "call":
        text = (payload or {}).get("transcript") or ""
        if not text.strip():
            return {"found": False, "reason": "No call transcript available", "turn_number": None, "speaker": None}
        if quote.strip() in text:
            return {"found": True, "reason": "Exact quote present in call transcript", "turn_number": None, "speaker": None, "match_type": "exact"}
        if q_norm in normalize_text(text):
            return {"found": True, "reason": "Normalized quote present in call transcript", "turn_number": None, "speaker": None, "match_type": "normalized"}
        return {"found": False, "reason": "Quote not found in call transcript", "turn_number": None, "speaker": None}

    for i, turn in enumerate(meeting_turns(transcript_payload), start=1):
        t = str(turn.get("text") or "")
        if quote.strip() in t:
            return {
                "found": True,
                "reason": f"Exact quote present in turn {i}",
                "turn_number": i,
                "speaker": turn.get("speaker"),
                "match_type": "exact",
            }
        if q_norm and q_norm in normalize_text(t):
            return {
                "found": True,
                "reason": f"Normalized quote present in turn {i}",
                "turn_number": i,
                "speaker": turn.get("speaker"),
                "match_type": "normalized",
            }
    return {"found": False, "reason": "Quote not found in meeting turns", "turn_number": None, "speaker": None}


def person_label(source_type: str, payload: dict) -> str | None:
    if source_type == "call":
        return payload.get("rep_name") or payload.get("rep_email")
    return payload.get("organizer_email")


def activity_at(source_type: str, payload: dict) -> str | None:
    if source_type == "call":
        return payload.get("started_at")
    return payload.get("starts_at")


def display_title(source_type: str, payload: dict, record_ref: str | None) -> str:
    if source_type == "meeting":
        return payload.get("title") or record_ref or "Meeting"
    outcome = payload.get("observed_outcome") or ""
    ref = record_ref or "Call"
    return f"{ref}" + (f" — {outcome}" if outcome else "")


def excerpt_around(text: str, match: re.Match[str] | None, window: int = 90) -> str:
    if not match or not text:
        return ""
    start = max(0, match.start() - window)
    end = min(len(text), match.end() + window)
    snippet = text[start:end].strip()
    # Prefer a sentence-ish slice that exists verbatim
    return snippet


def dumps(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False)
