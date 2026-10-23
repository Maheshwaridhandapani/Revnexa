"""Evidence Gate — validate findings against current source text/hash."""
from __future__ import annotations

import json

from .transcript_utils import find_quote_in_transcript


def validate_finding(conn, finding_id: int) -> dict:
    f = conn.execute("SELECT * FROM findings WHERE id = ?", (finding_id,)).fetchone()
    if not f:
        return {"ok": False, "gate_status": "Invalid Evidence", "reasons": ["Finding not found"]}

    src = conn.execute("SELECT * FROM source_records WHERE id = ?", (f["source_record_id"],)).fetchone()
    if not src:
        return {"ok": False, "gate_status": "Invalid Evidence", "reasons": ["Source record missing"]}

    reasons: list[str] = []
    payload = json.loads(src["payload_json"])
    tp = json.loads(src["transcript_payload_json"]) if src["transcript_payload_json"] else None

    if not f["evidence_quote"]:
        reasons.append("Missing evidence quote")
    else:
        loc = find_quote_in_transcript(f["evidence_quote"], src["source_type"], payload, tp)
        if not loc["found"]:
            reasons.append(loc["reason"])

    if f["source_hash"] and src["content_hash"] and f["source_hash"] != src["content_hash"]:
        reasons.append("Source content hash changed since analysis")
    if f["source_revision"] is not None and f["source_revision"] != src["applied_revision"]:
        reasons.append("Analysis revision does not match applied source revision")
    if f["is_stale"]:
        reasons.append("Finding already marked stale")

    if any("hash" in r or "revision" in r or "stale" in r.lower() for r in reasons):
        status = "Stale"
    elif reasons:
        status = "Invalid Evidence"
    elif f["requires_human_review"] or f["verification_status"] in {
        "Ambiguous",
        "Needs human review",
        "Partially supported",
    }:
        status = "Needs Review"
    else:
        status = "Verified"

    conn.execute(
        "UPDATE findings SET evidence_gate_status = ? WHERE id = ?",
        (status, finding_id),
    )
    return {
        "ok": status == "Verified",
        "gate_status": status,
        "reasons": reasons or ["Source exists; quote located; hash/revision match"],
        "finding_id": finding_id,
        "source_type": src["source_type"],
        "source_id": src["source_id"],
    }


def validate_record(conn, source_record_id: int) -> list[dict]:
    ids = conn.execute(
        "SELECT id FROM findings WHERE source_record_id = ? AND is_stale = 0",
        (source_record_id,),
    ).fetchall()
    return [validate_finding(conn, r["id"]) for r in ids]
