"""Manager brief for 21 August 2026, Asia/Kolkata — evidence-linked."""
from __future__ import annotations

import json
from typing import Any

from .metrics import dashboard_metrics


def build_manager_brief(conn) -> dict[str, Any]:
    m = dashboard_metrics(conn)
    findings = conn.execute(
        """
        SELECT f.*, s.record_ref, s.source_type, s.source_id, s.title
        FROM findings f
        JOIN source_records s ON s.id = f.source_record_id
        WHERE f.is_stale = 0
        ORDER BY f.id
        """
    ).fetchall()

    # Highlight three substantive themes with evidence
    highlights = []
    for cat in ("product_issue", "partnership", "coaching", "pricing", "no_interest"):
        for f in findings:
            if f["category"] == cat and f["verification_status"].startswith("Supported"):
                highlights.append(dict(f))
                break
        if len(highlights) >= 3:
            break
    highlights = highlights[:3]

    attention = conn.execute(
        """
        SELECT s.record_ref, s.source_type, s.source_id, s.title, r.review_status,
               r.current_routes_json, r.analysis_freshness, r.is_human_corrected
        FROM source_records s
        LEFT JOIN routing_decisions r ON r.source_record_id = s.id
        WHERE r.review_status IN ('needs_review', 'pending', 'reopened')
           OR r.analysis_freshness IN ('stale', 'pending-review')
           OR r.current_routes_json LIKE '%Human Decision Required%'
        ORDER BY s.record_ref
        LIMIT 15
        """
    ).fetchall()

    lines = [
        "# Revnexa Manager Brief — 21 August 2026 (Asia/Kolkata)",
        "",
        "## Observed activity (facts)",
        f"- Selected source records in database: **{m['total_source_records']}** (calls {m['calls']}, meetings {m['meetings']}).",
        f"- Usable supplied transcript text: **{m['usable_transcript_text']} / {m['transcript_coverage']['denominator']}** "
        f"({m['transcript_coverage']['percentage']}%).",
        f"- Definition: {m['transcript_coverage']['definition']}.",
        f"- Without usable text: **{m['without_usable_text']}** (intake/review state only — no fabricated analysis).",
        f"- Human-corrected routing decisions: **{m['human_corrected_decisions']}**.",
        f"- Awaiting review: **{m['awaiting_review']}**.",
        "",
        "## Interpretation (evidence-backed themes)",
    ]
    if not highlights:
        lines.append("- Insufficient supported findings to highlight themes yet. Import and analyze first.")
    for h in highlights:
        cite = f"{h['record_ref']} turn {h['turn_number']}" if h["turn_number"] else f"{h['record_ref']} quote"
        lines.append(f"- **{h['finding_text']}** ({cite})")
        lines.append(f"  - Quote: \"{h['evidence_quote']}\"")
        lines.append(f"  - Verification: {h['verification_status']}")
        lines.append(f"  - Limitation: {h['limitations']}")

    lines += [
        "",
        "## Routing distribution",
    ]
    for route, count in sorted(m["route_distribution"].items(), key=lambda x: -x[1]):
        lines.append(f"- {route}: {count} assignment(s)")
    lines.append(f"- Note: {m['route_note']}")

    lines += ["", "## Cases needing manager attention"]
    if not attention:
        lines.append("- None flagged under current review rules.")
    for a in attention:
        routes = json.loads(a["current_routes_json"] or "[]")
        lines.append(
            f"- {a['record_ref']} ({a['source_type']}): routes={routes}; "
            f"review={a['review_status']}; freshness={a['analysis_freshness']}; "
            f"manual={bool(a['is_human_corrected'])}"
        )

    lines += [
        "",
        "## Recommendations (not observed facts)",
        "- Prioritize product-issue and expired-token cases for internal notes.",
        "- Keep Do Not Contact overrides visible so re-imports do not erase judgment.",
        "- Re-review any record whose analysis_freshness is stale or pending-review after M07 update.",
        "",
        "## Data limitations",
        "- No CRM opportunity table, deal values, or staff-role directory is supplied.",
        "- Source summaries/classification_reason bodies are redacted (null) by design.",
        "- Meeting speaker labels are local to each meeting, not cross-meeting identities.",
        "- Product capability claims in conversation are speaker statements, not verified catalogue facts.",
        "- Live audio / meeting capture is out of scope; verification runs at import/analysis time.",
        "",
    ]

    markdown = "\n".join(lines)
    return {
        "date": "2026-08-21",
        "timezone": "Asia/Kolkata",
        "metrics": m,
        "highlights": highlights,
        "attention": [dict(a) for a in attention],
        "markdown": markdown,
    }
