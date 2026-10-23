"""Dashboard metrics with explicit denominators from live DB state."""
from __future__ import annotations

import json
from collections import Counter
from typing import Any
from zoneinfo import ZoneInfo

from ..config import BRIEF_TZ


def _parse_routes(raw: str | None) -> list[str]:
    if not raw:
        return []
    try:
        val = json.loads(raw)
        return val if isinstance(val, list) else []
    except json.JSONDecodeError:
        return []


def dashboard_metrics(conn, *, source_type: str | None = None, person: str | None = None) -> dict[str, Any]:
    clauses = ["1=1"]
    params: list[Any] = []
    if source_type:
        clauses.append("source_type = ?")
        params.append(source_type)
    if person:
        clauses.append("person_label = ?")
        params.append(person)
    where = " AND ".join(clauses)

    rows = conn.execute(f"SELECT * FROM source_records WHERE {where}", params).fetchall()
    total = len(rows)
    calls = sum(1 for r in rows if r["source_type"] == "call")
    meetings = sum(1 for r in rows if r["source_type"] == "meeting")
    usable = sum(1 for r in rows if r["has_usable_text"])
    without = total - usable
    coverage = (usable / total * 100) if total else 0.0

    ids = [r["id"] for r in rows]
    awaiting_analysis = 0
    awaiting_review = 0
    human_corrected = 0
    gate_counts: Counter[str] = Counter()
    route_counts: Counter[str] = Counter()
    verification_counts: Counter[str] = Counter()

    for rid in ids:
        analyses = conn.execute(
            "SELECT COUNT(*) AS c FROM analysis_results WHERE source_record_id = ?",
            (rid,),
        ).fetchone()["c"]
        if analyses == 0:
            awaiting_analysis += 1
        rd = conn.execute(
            "SELECT * FROM routing_decisions WHERE source_record_id = ?",
            (rid,),
        ).fetchone()
        if rd:
            if rd["review_status"] in {"pending", "needs_review", "reopened"} or rd["analysis_freshness"] in {
                "stale",
                "pending-review",
            }:
                awaiting_review += 1
            if rd["is_human_corrected"]:
                human_corrected += 1
            for route in _parse_routes(rd["current_routes_json"]):
                route_counts[route] += 1
        findings = conn.execute(
            "SELECT verification_status, evidence_gate_status FROM findings WHERE source_record_id = ? AND is_stale = 0",
            (rid,),
        ).fetchall()
        for f in findings:
            verification_counts[f["verification_status"]] += 1
            gate_counts[f["evidence_gate_status"]] += 1

    # Activity by Asia/Kolkata local date
    by_day: Counter[str] = Counter()
    by_rep: Counter[str] = Counter()
    by_org: Counter[str] = Counter()
    tz = ZoneInfo(BRIEF_TZ)
    for r in rows:
        if r["activity_at"]:
            try:
                from datetime import datetime

                dt = datetime.fromisoformat(r["activity_at"].replace("Z", "+00:00")).astimezone(tz)
                by_day[dt.date().isoformat()] += 1
            except Exception:
                by_day["unknown"] += 1
        if r["source_type"] == "call" and r["person_label"]:
            by_rep[r["person_label"]] += 1
        if r["source_type"] == "meeting" and r["person_label"]:
            by_org[r["person_label"]] += 1

    batch = conn.execute(
        "SELECT * FROM import_batches ORDER BY imported_at DESC LIMIT 1"
    ).fetchone()

    audits = conn.execute(
        """
        SELECT * FROM audit_events ORDER BY created_at DESC LIMIT 20
        """
    ).fetchall()

    persons = [
        r["person_label"]
        for r in conn.execute(
            "SELECT DISTINCT person_label FROM source_records WHERE person_label IS NOT NULL ORDER BY person_label"
        ).fetchall()
    ]

    return {
        "total_source_records": total,
        "calls": calls,
        "meetings": meetings,
        "usable_transcript_text": usable,
        "without_usable_text": without,
        "transcript_coverage": {
            "numerator": usable,
            "denominator": total,
            "percentage": round(coverage, 2),
            "definition": "records with usable supplied transcript text / total imported source records",
        },
        "awaiting_analysis": awaiting_analysis,
        "awaiting_review": awaiting_review,
        "human_corrected_decisions": human_corrected,
        "evidence_validation": dict(gate_counts),
        "fact_check_statuses": dict(verification_counts),
        "route_distribution": dict(route_counts),
        "route_assignment_count": sum(route_counts.values()),
        "route_note": "Route assignment counts may exceed unique records when a record has multiple routes.",
        "activity_by_day": dict(sorted(by_day.items())),
        "activity_by_call_rep": dict(by_rep.most_common()),
        "activity_by_meeting_organizer": dict(by_org.most_common()),
        "activity_note": (
            "All selected activity falls on one Asia/Kolkata local date after date shifting; "
            "a date filter alone is not sufficient — use person or source-type filters."
        ),
        "persons": persons,
        "latest_import": dict(batch) if batch else None,
        "recent_audit": [dict(a) for a in audits],
        "filters_applied": {"source_type": source_type, "person": person},
    }
