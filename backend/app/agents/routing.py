"""
Agent 3 — Routing & Action.

Suggests one or more routes from validated findings. Never overwrites an
explicit human correction. Processing mode: deterministic rules.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from ..services.transcript_utils import dumps

# Priority-ordered rules → may assign multiple routes
ROUTE_RULES: list[dict[str, Any]] = [
    {
        "categories": {"no_interest"},
        "route": "Do Not Contact",
        "reason": "Contact explicitly declined interest or stated existing coverage.",
        "priority": 100,
    },
    {
        "categories": {"product_issue", "risk"},
        "route": "Internal/Vendor Notes",
        "reason": "Product defect, workflow failure, or escalation signal needs internal tracking.",
        "priority": 90,
    },
    {
        "categories": {"partnership"},
        "route": "Deal Next Steps",
        "reason": "Partnership/referral commercial interest requires structured next steps.",
        "priority": 85,
    },
    {
        "categories": {"pricing", "objection"},
        "route": "Deal Next Steps",
        "reason": "Pricing discussion or product objection needs commercial follow-through.",
        "priority": 80,
    },
    {
        "categories": {"commitment", "follow_up", "contact_info"},
        "route": "Customer Follow-up",
        "reason": "Agreed follow-up, commitment, or contact exchange should be tracked.",
        "priority": 70,
    },
    {
        "categories": {"coaching"},
        "route": "Sales Coaching",
        "reason": "Cold-call framing, audio issues, or boundary signals are coaching material.",
        "priority": 60,
    },
]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def suggest_routes(findings: list[dict], has_usable_text: bool) -> tuple[list[str], list[dict]]:
    if not has_usable_text:
        return (
            ["Human Decision Required"],
            [
                {
                    "route": "Human Decision Required",
                    "reason": "No usable supplied transcript text — intake state only; do not invent analysis.",
                    "supporting_categories": [],
                }
            ],
        )

    if not findings:
        return (
            ["No Action Required"],
            [
                {
                    "route": "No Action Required",
                    "reason": "Usable text present but no actionable patterns matched.",
                    "supporting_categories": [],
                }
            ],
        )

    cats = {f.get("category") for f in findings}
    # Unsupported/ambiguous → force human review alongside other routes
    needs_human = any(
        f.get("verification_status") in {"Unsupported", "Ambiguous", "Needs human review"}
        or f.get("requires_human_review")
        for f in findings
    )

    matched: list[dict] = []
    for rule in sorted(ROUTE_RULES, key=lambda r: -r["priority"]):
        hit = cats & rule["categories"]
        if hit:
            matched.append(
                {
                    "route": rule["route"],
                    "reason": rule["reason"],
                    "supporting_categories": sorted(hit),
                    "priority": rule["priority"],
                }
            )

    # Deduplicate routes keeping highest-priority reason
    by_route: dict[str, dict] = {}
    for m in matched:
        prev = by_route.get(m["route"])
        if not prev or m["priority"] > prev["priority"]:
            by_route[m["route"]] = m

    routes = list(by_route.keys())
    reasons = list(by_route.values())

    # Difficult / multi-purpose conversations get Human Decision Required too
    if needs_human or len(routes) >= 3:
        if "Human Decision Required" not in routes:
            routes.append("Human Decision Required")
            reasons.append(
                {
                    "route": "Human Decision Required",
                    "reason": "Ambiguous evidence, unsupported claims, or multiple competing purposes require manager judgment.",
                    "supporting_categories": sorted(cats),
                }
            )

    if not routes:
        routes = ["Human Decision Required"]
        reasons = [
            {
                "route": "Human Decision Required",
                "reason": "Findings present but no routing rule matched cleanly.",
                "supporting_categories": sorted(cats),
            }
        ]

    return routes, reasons


def route_record(conn, source_record_id: int) -> dict:
    row = conn.execute("SELECT * FROM source_records WHERE id = ?", (source_record_id,)).fetchone()
    if not row:
        raise ValueError("Record not found")

    findings = [
        dict(f)
        for f in conn.execute(
            "SELECT * FROM findings WHERE source_record_id = ? AND is_stale = 0",
            (source_record_id,),
        ).fetchall()
    ]
    routes, reasons = suggest_routes(findings, bool(row["has_usable_text"]))
    now = _now()

    existing = conn.execute(
        "SELECT * FROM routing_decisions WHERE source_record_id = ?",
        (source_record_id,),
    ).fetchone()

    if existing and existing["is_human_corrected"]:
        # Update AI suggestion only; keep current manager routes
        conn.execute(
            """
            UPDATE routing_decisions
            SET ai_suggested_routes_json = ?, route_reasons_json = ?,
                source_revision_at_decision = ?, updated_at = ?
            WHERE source_record_id = ?
            """,
            (dumps(routes), dumps(reasons), row["applied_revision"], now, source_record_id),
        )
        action = "preserved_human_decision"
    elif existing:
        conn.execute(
            """
            UPDATE routing_decisions
            SET ai_suggested_routes_json = ?, current_routes_json = ?,
                route_reasons_json = ?, analysis_freshness = 'current',
                source_revision_at_decision = ?, updated_at = ?
            WHERE source_record_id = ?
            """,
            (dumps(routes), dumps(routes), dumps(reasons), row["applied_revision"], now, source_record_id),
        )
        action = "updated_ai_routes"
    else:
        review = "needs_review" if "Human Decision Required" in routes else "pending"
        conn.execute(
            """
            INSERT INTO routing_decisions
              (source_record_id, ai_suggested_routes_json, current_routes_json,
               route_reasons_json, is_human_corrected, review_status, review_note,
               analysis_freshness, source_revision_at_decision, created_at, updated_at)
            VALUES (?, ?, ?, ?, 0, ?, NULL, 'current', ?, ?, ?)
            """,
            (
                source_record_id,
                dumps(routes),
                dumps(routes),
                dumps(reasons),
                review,
                row["applied_revision"],
                now,
                now,
            ),
        )
        action = "created"

    conn.execute(
        """
        INSERT INTO agent_events
          (source_record_id, agent_name, event_type, inputs_json, outputs_json,
           status, processing_mode, created_at)
        VALUES (?, 'Routing & Action', ?, ?, ?, 'completed', 'deterministic', ?)
        """,
        (
            source_record_id,
            action,
            dumps({"finding_count": len(findings)}),
            dumps({"routes": routes, "reasons": reasons}),
            now,
        ),
    )
    return {"routes": routes, "reasons": reasons, "action": action}


def route_all(conn) -> dict:
    rows = conn.execute("SELECT id FROM source_records").fetchall()
    for r in rows:
        route_record(conn, r["id"])
    return {"routed": len(rows)}


def correct_routes(
    conn,
    source_record_id: int,
    routes: list[str],
    *,
    note: str | None = None,
    review_status: str = "approved",
) -> dict:
    existing = conn.execute(
        "SELECT * FROM routing_decisions WHERE source_record_id = ?",
        (source_record_id,),
    ).fetchone()
    if not existing:
        raise ValueError("No routing decision to correct — run analysis first")

    now = _now()
    prev = existing["current_routes_json"]
    conn.execute(
        """
        UPDATE routing_decisions
        SET current_routes_json = ?, is_human_corrected = 1,
            review_status = ?, review_note = ?,
            analysis_freshness = CASE
              WHEN analysis_freshness = 'stale' THEN 'pending-review'
              ELSE analysis_freshness
            END,
            updated_at = ?
        WHERE source_record_id = ?
        """,
        (dumps(routes), review_status, note, now, source_record_id),
    )
    conn.execute(
        """
        INSERT INTO decision_history
          (source_record_id, previous_routes_json, new_routes_json, actor, note, created_at)
        VALUES (?, ?, ?, 'manager', ?, ?)
        """,
        (source_record_id, prev, dumps(routes), note, now),
    )
    conn.execute(
        """
        INSERT INTO audit_events
          (source_record_id, event_type, previous_value, new_value, actor, created_at)
        VALUES (?, 'route_corrected', ?, ?, 'manager', ?)
        """,
        (source_record_id, prev, dumps(routes), now),
    )
    return {"source_record_id": source_record_id, "routes": routes, "persisted": True}
