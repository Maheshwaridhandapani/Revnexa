"""Text manager assistant — reads the same validated DB. Voice is not implemented."""
from __future__ import annotations

import json
import re


def ask(conn, question: str) -> dict:
    q = (question or "").lower()
    citations: list[dict] = []
    answer_lines: list[str] = []

    if "unsupported" in q or "fact-check" in q or "claims" in q:
        rows = conn.execute(
            """
            SELECT f.finding_text, f.verification_status, f.evidence_quote, s.record_ref, s.source_id
            FROM findings f JOIN source_records s ON s.id = f.source_record_id
            WHERE f.is_stale = 0 AND f.verification_status IN ('Unsupported', 'Ambiguous', 'Needs human review')
            LIMIT 20
            """
        ).fetchall()
        answer_lines.append(f"{len(rows)} current claim(s) need attention.")
        for r in rows:
            answer_lines.append(f"- {r['record_ref']}: {r['finding_text']} ({r['verification_status']})")
            citations.append(dict(r))
    elif "corrected" in q or "manual" in q or "override" in q:
        rows = conn.execute(
            """
            SELECT s.record_ref, s.source_id, r.current_routes_json, r.review_note
            FROM routing_decisions r JOIN source_records s ON s.id = r.source_record_id
            WHERE r.is_human_corrected = 1
            """
        ).fetchall()
        answer_lines.append(f"{len(rows)} human-corrected route(s).")
        for r in rows:
            answer_lines.append(f"- {r['record_ref']}: {r['current_routes_json']}")
            citations.append(dict(r))
    elif "review" in q or "need" in q:
        rows = conn.execute(
            """
            SELECT s.record_ref, s.source_type, s.source_id, r.review_status, r.analysis_freshness
            FROM routing_decisions r JOIN source_records s ON s.id = r.source_record_id
            WHERE r.review_status IN ('pending', 'needs_review', 'reopened')
               OR r.analysis_freshness IN ('stale', 'pending-review')
            """
        ).fetchall()
        answer_lines.append(f"{len(rows)} conversation(s) need review.")
        for r in rows:
            answer_lines.append(f"- {r['record_ref']} ({r['source_type']}): {r['review_status']} / {r['analysis_freshness']}")
            citations.append(dict(r))
    elif "concern" in q:
        rows = conn.execute(
            """
            SELECT f.finding_text, f.evidence_quote, s.record_ref, f.turn_number
            FROM findings f JOIN source_records s ON s.id = f.source_record_id
            WHERE f.is_stale = 0 AND f.category IN ('objection', 'risk', 'no_interest', 'product_issue')
            LIMIT 20
            """
        ).fetchall()
        answer_lines.append(f"{len(rows)} concern-related finding(s).")
        for r in rows:
            answer_lines.append(f"- {r['record_ref']}: {r['finding_text']}")
            citations.append(dict(r))
    else:
        m = dashboard_lite(conn)
        answer_lines.append(
            f"Revnexa has {m['total']} records, {m['usable']} with usable text. "
            "Ask about review, unsupported claims, concerns, or corrected routes."
        )

    return {
        "question": question,
        "answer": "\n".join(answer_lines) or "No matching validated records.",
        "citations": citations,
        "voice_implemented": False,
        "disclosure": "Text assistant only. Answers cite stored evidence; no invented transcripts.",
        "route_change_requires_confirm": True,
    }


def dashboard_lite(conn) -> dict:
    total = conn.execute("SELECT COUNT(*) AS c FROM source_records").fetchone()["c"]
    usable = conn.execute("SELECT COUNT(*) AS c FROM source_records WHERE has_usable_text = 1").fetchone()["c"]
    return {"total": total, "usable": usable}
