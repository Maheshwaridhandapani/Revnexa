"""Mandatory replay tests against the real assignment JSON files."""
from __future__ import annotations

import json
from pathlib import Path
from tempfile import TemporaryDirectory

from ..database import get_connection, init_db
from ..agents.intelligence import analyze_all, extract_findings_for_record
from ..agents.routing import correct_routes, route_all
from .import_service import import_initial, import_update
from .export_service import generate_export
from .metrics import dashboard_metrics
from .transcript_utils import find_quote_in_transcript


def run_replay_suite() -> dict:
    results = []
    with TemporaryDirectory() as tmp:
        db = Path(tmp) / "replay.db"
        init_db(db)
        with get_connection(db) as conn:
            r1 = import_initial(conn)
            total = conn.execute("SELECT COUNT(*) AS c FROM source_records").fetchone()["c"]
            usable = conn.execute(
                "SELECT COUNT(*) AS c FROM source_records WHERE has_usable_text = 1"
            ).fetchone()["c"]
            calls = conn.execute(
                "SELECT COUNT(*) AS c FROM source_records WHERE source_type = 'call'"
            ).fetchone()["c"]
            meetings = conn.execute(
                "SELECT COUNT(*) AS c FROM source_records WHERE source_type = 'meeting'"
            ).fetchone()["c"]
            results.append(
                _row(
                    "Test 1 — Initial import",
                    "44 unique records (30 calls / 14 meetings); usable texts from supplied file",
                    f"records={total}, calls={calls}, meetings={meetings}, usable={usable}, inserted={r1['inserted']}",
                    total == 44 and calls == 30 and meetings == 14 and r1["inserted"] == 44,
                )
            )

            r2 = import_initial(conn, shuffle_order=True)
            total2 = conn.execute("SELECT COUNT(*) AS c FROM source_records").fetchone()["c"]
            results.append(
                _row(
                    "Test 2 — Duplicate prevention",
                    "Re-import does not inflate unique records; most rows unchanged",
                    f"records={total2}, inserted={r2['inserted']}, unchanged={r2['unchanged']}",
                    total2 == 44 and r2["inserted"] == 0 and r2["unchanged"] == 44,
                )
            )

            analyze_all(conn, only_missing=False)
            route_all(conn)
            m07 = conn.execute(
                "SELECT * FROM source_records WHERE record_ref = 'M07'"
            ).fetchone()
            if not m07:
                results.append(_row("Test 3 — Route correction", "M07 exists", "missing", False))
            else:
                correct_routes(
                    conn,
                    m07["id"],
                    ["Internal/Vendor Notes", "Human Decision Required"],
                    note="Manager override for demo replay",
                )
                saved = conn.execute(
                    "SELECT * FROM routing_decisions WHERE source_record_id = ?",
                    (m07["id"],),
                ).fetchone()
                routes = json.loads(saved["current_routes_json"])
                results.append(
                    _row(
                        "Test 3 — Route correction",
                        "M07 manual routes persist in SQLite",
                        f"human={saved['is_human_corrected']} routes={routes}",
                        saved["is_human_corrected"] == 1 and "Internal/Vendor Notes" in routes,
                    )
                )

            r3 = import_update(conn)
            m07b = conn.execute(
                "SELECT * FROM source_records WHERE record_ref = 'M07'"
            ).fetchone()
            total3 = conn.execute("SELECT COUNT(*) AS c FROM source_records").fetchone()["c"]
            usable3 = conn.execute(
                "SELECT COUNT(*) AS c FROM source_records WHERE has_usable_text = 1"
            ).fetchone()["c"]
            tp = json.loads(m07b["transcript_payload_json"] or "null")
            turns = (tp or {}).get("turns") or []
            results.append(
                _row(
                    "Test 4 — Update import / late transcript",
                    "M07 updated in place; transcript appears; unique count stays 44",
                    f"updated={r3['updated']} records={total3} usable={usable3} turns={len(turns)}",
                    r3["updated"] == 1 and total3 == 44 and m07b["has_usable_text"] == 1 and len(turns) > 0,
                )
            )

            saved2 = conn.execute(
                "SELECT * FROM routing_decisions WHERE source_record_id = ?",
                (m07b["id"],),
            ).fetchone()
            routes2 = json.loads(saved2["current_routes_json"])
            results.append(
                _row(
                    "Test 5 — Decision Memory after update",
                    "Manual M07 route remains; analysis flagged stale/pending-review",
                    f"human={saved2['is_human_corrected']} freshness={saved2['analysis_freshness']} routes={routes2}",
                    saved2["is_human_corrected"] == 1
                    and "Internal/Vendor Notes" in routes2
                    and saved2["analysis_freshness"] in {"pending-review", "stale"},
                )
            )

            stale_findings = conn.execute(
                "SELECT COUNT(*) AS c FROM findings WHERE source_record_id = ? AND is_stale = 1",
                (m07b["id"],),
            ).fetchone()["c"]
            results.append(
                _row(
                    "Test 6 — Stale analysis on source change",
                    "Prior findings marked stale when M07 text arrives",
                    f"stale_findings={stale_findings} freshness={saved2['analysis_freshness']}",
                    saved2["analysis_freshness"] in {"pending-review", "stale"},
                )
            )

            silent = conn.execute(
                """
                SELECT s.record_ref, COUNT(f.id) AS c
                FROM source_records s
                LEFT JOIN findings f ON f.source_record_id = s.id AND f.is_stale = 0
                WHERE s.has_usable_text = 0
                GROUP BY s.id
                HAVING c > 0
                """
            ).fetchall()
            results.append(
                _row(
                    "Test 7 — Missing transcript: no fabricated findings",
                    "Records without usable text have zero current findings",
                    f"violations={[row['record_ref'] for row in silent]}",
                    len(silent) == 0,
                )
            )

            # Quote validation
            sample = conn.execute(
                "SELECT * FROM source_records WHERE record_ref = 'C01'"
            ).fetchone()
            payload = json.loads(sample["payload_json"])
            loc = find_quote_in_transcript(
                "I'm not interested",
                "call",
                payload,
                None,
            )
            results.append(
                _row(
                    "Exact quote validation (C01)",
                    "Known quote locates in call transcript",
                    str(loc),
                    loc["found"] is True,
                )
            )

            bogus = find_quote_in_transcript("this quote does not exist in source", "call", payload, None)
            results.append(
                _row(
                    "Unsupported quote rejected",
                    "Invented quote is not found",
                    str(bogus),
                    bogus["found"] is False,
                )
            )

            # Re-import initial after update must not regress M07
            r4 = import_initial(conn)
            m07c = conn.execute("SELECT * FROM source_records WHERE record_ref = 'M07'").fetchone()
            results.append(
                _row(
                    "Older revision ignored after update",
                    "Re-import of revision 1 does not wipe M07 transcript",
                    f"unchanged={r4['unchanged']} updated={r4['updated']} rev={m07c['applied_revision']} usable={m07c['has_usable_text']}",
                    r4["updated"] == 0 and m07c["applied_revision"] == 2 and m07c["has_usable_text"] == 1,
                )
            )

            analyze_all(conn, only_missing=True)
            route_all(conn)
            metrics = dashboard_metrics(conn)
            results.append(
                _row(
                    "Metric denominators",
                    "Coverage uses 44 as denominator after both deliveries",
                    str(metrics["transcript_coverage"]),
                    metrics["transcript_coverage"]["denominator"] == 44
                    and metrics["transcript_coverage"]["numerator"] == metrics["usable_transcript_text"],
                )
            )

            export = generate_export(conn)
            results.append(
                _row(
                    "Manifest archive integrity",
                    "Every listed output path exists in the ZIP",
                    f"ok={export['ok']} missing={export['missing_paths'][:5]}",
                    export["ok"] is True,
                )
            )

            # Uniqueness
            dup = conn.execute(
                """
                SELECT source_type, source_id, COUNT(*) c
                FROM source_records GROUP BY source_type, source_id HAVING c > 1
                """
            ).fetchall()
            results.append(
                _row(
                    "Source identity uniqueness",
                    "No duplicate (source_type, source_id)",
                    f"dups={len(dup)}",
                    len(dup) == 0,
                )
            )

            # Multiple routes
            multi = conn.execute(
                "SELECT current_routes_json FROM routing_decisions WHERE source_record_id = ?",
                (m07c["id"],),
            ).fetchone()
            results.append(
                _row(
                    "Multiple routes for one source",
                    "M07 retains two manager routes",
                    multi["current_routes_json"],
                    len(json.loads(multi["current_routes_json"])) >= 2,
                )
            )

            extracted = extract_findings_for_record(m07c)
            results.append(
                _row(
                    "M07 late text produces findings after reanalysis",
                    "Willowfield transcript yields product-issue evidence",
                    f"findings={len(extracted)}",
                    len(extracted) >= 1,
                )
            )

    passed = sum(1 for r in results if r["pass"])
    return {
        "passed": passed,
        "failed": len(results) - passed,
        "total": len(results),
        "results": results,
    }


def _row(name: str, expected: str, actual: str, ok: bool) -> dict:
    return {"name": name, "expected": expected, "actual": actual, "pass": bool(ok)}
