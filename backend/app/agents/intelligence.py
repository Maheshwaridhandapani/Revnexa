"""
Agent 2 — Conversation Intelligence + Fact Checker (deterministic).

Extracts claims only from usable transcript text. Every finding includes an
exact evidence quote located in the source. Processing mode: deterministic
unless REVNEXA_LLM_API_KEY is configured (then hybrid disclosure applies).
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

from ..config import AI_MODE
from ..services.transcript_utils import (
    dumps,
    extract_usable_text,
    find_quote_in_transcript,
    meeting_turns,
    normalize_text,
)

PATTERNS: list[dict[str, Any]] = [
    {
        "category": "no_interest",
        "finding": "Contact expressed no interest or existing coverage",
        "patterns": [
            r"not interested",
            r"don'?t (need|want) (this|that|it)",
            r"already (have|got) (that|this|it|a solution|everything|those)",
            r"arrangements are already in place",
            r"don'?t work there anymore",
            r"not (looking for|shopping for)",
        ],
    },
    {
        "category": "partnership",
        "finding": "Partnership or referral interest expressed",
        "patterns": [
            r"sensible commercial arrangement",
            r"partner (with|arrangement|commission)",
            r"referral (link|code)",
            r"partner onboarding",
            r"commission",
        ],
    },
    {
        "category": "commitment",
        "finding": "Representative committed to a next step",
        "patterns": [
            r"I will send",
            r"I'?ll send",
            r"I will (call|email|follow up|check|confirm|arrange|share)",
            r"I'?ll (call|email|follow up|check|confirm|send|try)",
            r"send the (proposal|information|details|documents|template)",
        ],
    },
    {
        "category": "pricing",
        "finding": "Pricing or cost discussed in conversation",
        "patterns": [
            r"INR\s*[\d,.–\-]+",
            r"USD\s*[\d,.–\-]+",
            r"EUR\s*[\d,.–\-]+",
            r"annual (charge|subscription|fee)",
            r"monthly (charge|fee)",
            r"pricing",
        ],
    },
    {
        "category": "follow_up",
        "finding": "Follow-up call or email agreed",
        "patterns": [
            r"call (on |back )?(monday|tuesday|wednesday|thursday|friday)",
            r"follow.?up (call|email|on)",
            r"speak (monday|tuesday|on)",
        ],
    },
    {
        "category": "coaching",
        "finding": "Coaching opportunity (cold call / audio / framing)",
        "patterns": [
            r"cold call",
            r"didn'?t ask for this call",
            r"where did you find my details",
            r"why (are you|have you) call",
            r"I can'?t hear",
            r"sound is very faint",
            r"connection (problem|issue|dropped)",
        ],
    },
    {
        "category": "risk",
        "finding": "Risk or escalation indicator",
        "patterns": [
            r"wrong email",
            r"outstanding for months",
            r"put on hold",
            r"token has expired",
            r"stuck showing Processing",
            r"cannot upload",
            r"compliance",
        ],
    },
    {
        "category": "objection",
        "finding": "Product or pricing objection raised",
        "patterns": [
            r"prepaid",
            r"credit (card|facility|line)",
            r"previously told me",
            r"why has that become",
            r"not essential enough",
        ],
    },
    {
        "category": "product_issue",
        "finding": "Product defect or workflow bug reported",
        "patterns": [
            r"still the old description",
            r"cannot upload a document",
            r"old value carries forward",
            r"selection is disabled",
            r"token has expired",
        ],
    },
    {
        "category": "contact_info",
        "finding": "Contact information exchanged",
        "patterns": [
            r"contact\d+@example\.com",
            r"email address",
            r"messaging app",
        ],
    },
]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _quote_from_match(text: str, m: re.Match[str], pad: int = 40) -> str:
    start = max(0, m.start() - pad)
    end = min(len(text), m.end() + pad)
    # Expand to nearby word boundaries while staying within source text
    snippet = text[start:end].strip()
    # Prefer returning the matched span if short; else surrounding context that exists in source
    matched = m.group(0)
    if matched in text:
        # Find a sentence-like window containing the match
        idx = text.find(matched)
        s = max(0, idx - 50)
        e = min(len(text), idx + len(matched) + 50)
        return text[s:e].strip()
    return snippet


def extract_findings_for_record(row: dict | Any) -> list[dict]:
    """Return structured findings with evidence. Empty if no usable text."""
    row = dict(row)
    source_type = row["source_type"]
    payload = json_loads(row.get("payload_json"))
    tp_raw = row.get("transcript_payload_json")
    transcript_payload = json_loads(tp_raw) if tp_raw else None

    text = extract_usable_text(source_type, payload, transcript_payload)
    if not text:
        return []

    findings: list[dict] = []
    seen: set[str] = set()

    # Build searchable corpus with turn awareness for meetings
    search_units: list[tuple[str, int | None, str | None]] = []
    if source_type == "meeting":
        for i, turn in enumerate(meeting_turns(transcript_payload), start=1):
            t = str(turn.get("text") or "")
            if t.strip():
                search_units.append((t, i, turn.get("speaker")))
    else:
        search_units.append((text, None, None))

    for rule in PATTERNS:
        for pat in rule["patterns"]:
            rx = re.compile(pat, re.IGNORECASE)
            for unit_text, turn_no, speaker in search_units:
                m = rx.search(unit_text)
                if not m:
                    continue
                quote = _quote_from_match(unit_text, m)
                # Evidence must exist verbatim (or as substring of unit)
                if quote not in unit_text and m.group(0) not in unit_text:
                    continue
                evidence = quote if quote in unit_text else m.group(0)
                key = f"{rule['category']}|{normalize_text(evidence)[:80]}"
                if key in seen:
                    continue
                seen.add(key)

                loc = find_quote_in_transcript(evidence, source_type, payload, transcript_payload)
                if loc["found"]:
                    status = "Supported by transcript"
                    reason = (
                        "The claim restates a statement that appears in the supplied transcript. "
                        "This verifies conversational evidence only — not independent real-world truth."
                    )
                    gate = "Verified"
                    needs_review = 0
                else:
                    status = "Unsupported"
                    reason = "Pattern matched but evidence quote could not be relocated in source text."
                    gate = "Invalid Evidence"
                    needs_review = 1

                # Ambiguous markers
                if re.search(r"might|perhaps|rough|estimate|I think|not sure|needs checking", evidence, re.I):
                    if status == "Supported by transcript":
                        status = "Ambiguous"
                        reason += " Speaker language is uncertain; do not treat as established fact."
                        gate = "Needs Review"
                        needs_review = 1

                findings.append(
                    {
                        "category": rule["category"],
                        "finding_text": rule["finding"],
                        "evidence_quote": evidence,
                        "turn_number": loc.get("turn_number") or turn_no,
                        "speaker": loc.get("speaker") or speaker,
                        "relevance": f"Pattern '{pat}' matched supplied text under category {rule['category']}.",
                        "limitations": (
                            "Deterministic extraction; does not verify external facts, ownership, "
                            "or outcomes beyond the supplied transcript."
                        ),
                        "verification_status": status,
                        "verification_reason": reason,
                        "requires_human_review": needs_review,
                        "evidence_gate_status": gate,
                    }
                )
                break  # one hit per pattern per record is enough

    return findings


def json_loads(raw: Any) -> Any:
    import json

    if raw is None:
        return None
    if isinstance(raw, (dict, list)):
        return raw
    return json.loads(raw)


def analyze_record(conn, source_record_id: int, *, force: bool = False) -> dict:
    row = conn.execute("SELECT * FROM source_records WHERE id = ?", (source_record_id,)).fetchone()
    if not row:
        raise ValueError(f"Source record {source_record_id} not found")

    # Skip reanalysis if current findings exist and not stale (unless force)
    existing = conn.execute(
        """
        SELECT COUNT(*) AS c FROM findings
        WHERE source_record_id = ? AND is_stale = 0
        """,
        (source_record_id,),
    ).fetchone()["c"]
    if existing and not force and row["has_usable_text"]:
        # Keep existing unless source hash mismatch
        pass

    now = _now()
    findings = extract_findings_for_record(row)

    analysis = {
        "mode": AI_MODE,
        "finding_count": len(findings),
        "has_usable_text": bool(row["has_usable_text"]),
        "note": (
            "Deterministic Conversation Intelligence. No LLM was called."
            if AI_MODE == "deterministic"
            else "Hybrid mode available; this run used deterministic extraction."
        ),
    }

    cur = conn.execute(
        """
        INSERT INTO analysis_results
          (source_record_id, agent_stage, result_json, source_hash, source_revision,
           evidence_gate_status, processing_status, analysis_freshness, created_at)
        VALUES (?, 'Conversation Intelligence', ?, ?, ?, ?, ?, 'current', ?)
        """,
        (
            source_record_id,
            dumps(analysis),
            row["content_hash"],
            row["applied_revision"],
            "Verified" if findings else ("Needs Review" if row["has_usable_text"] else "Verified"),
            "complete" if row["has_usable_text"] else "no_transcript",
            now,
        ),
    )
    analysis_id = cur.lastrowid

    # Soft-stale prior findings when reanalyzing
    if force or findings:
        conn.execute(
            "UPDATE findings SET is_stale = 1 WHERE source_record_id = ? AND is_stale = 0",
            (source_record_id,),
        )

    for f in findings:
        conn.execute(
            """
            INSERT INTO findings
              (source_record_id, analysis_id, category, finding_text, evidence_quote,
               turn_number, speaker, relevance, limitations, verification_status,
               verification_reason, requires_human_review, evidence_gate_status,
               source_hash, source_revision, is_stale, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
            """,
            (
                source_record_id,
                analysis_id,
                f["category"],
                f["finding_text"],
                f["evidence_quote"],
                f["turn_number"],
                f["speaker"],
                f["relevance"],
                f["limitations"],
                f["verification_status"],
                f["verification_reason"],
                f["requires_human_review"],
                f["evidence_gate_status"],
                row["content_hash"],
                row["applied_revision"],
                now,
            ),
        )

    if not row["has_usable_text"]:
        # Explicit intake state — no fabricated substantive findings
        conn.execute(
            """
            INSERT INTO agent_events
              (source_record_id, agent_name, event_type, inputs_json, outputs_json,
               status, processing_mode, created_at)
            VALUES (?, 'Conversation Intelligence', 'skipped_no_transcript', ?, ?,
                    'completed', 'deterministic', ?)
            """,
            (
                source_record_id,
                dumps({"reason": "No usable supplied transcript text"}),
                dumps({"findings": 0}),
                now,
            ),
        )
    else:
        conn.execute(
            """
            INSERT INTO agent_events
              (source_record_id, agent_name, event_type, inputs_json, outputs_json,
               status, processing_mode, created_at)
            VALUES (?, 'Conversation Intelligence', 'analysis_complete', ?, ?,
                    'completed', ?, ?)
            """,
            (
                source_record_id,
                dumps({"content_hash": row["content_hash"]}),
                dumps({"findings": len(findings), "mode": AI_MODE}),
                "deterministic",
                now,
            ),
        )

    return {"analysis_id": analysis_id, "findings": findings, "mode": AI_MODE}


def analyze_all(conn, *, only_missing: bool = True) -> dict:
    rows = conn.execute("SELECT id FROM source_records ORDER BY id").fetchall()
    done = 0
    for r in rows:
        if only_missing:
            has = conn.execute(
                "SELECT COUNT(*) AS c FROM analysis_results WHERE source_record_id = ?",
                (r["id"],),
            ).fetchone()["c"]
            stale = conn.execute(
                """
                SELECT COUNT(*) AS c FROM analysis_results
                WHERE source_record_id = ? AND analysis_freshness = 'stale'
                """,
                (r["id"],),
            ).fetchone()["c"]
            if has and not stale:
                continue
        analyze_record(conn, r["id"], force=True)
        done += 1
    return {"analyzed": done, "total_records": len(rows)}
