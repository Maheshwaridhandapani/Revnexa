"""Generate JSON/CSV manifests and ZIP archives with real output files."""
from __future__ import annotations

import csv
import io
import json
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ..config import EXPORTS_DIR
from .transcript_utils import dumps


def _now_slug() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _routes(raw: str | None) -> list[str]:
    if not raw:
        return []
    try:
        v = json.loads(raw)
        return v if isinstance(v, list) else []
    except json.JSONDecodeError:
        return []


def _safe_slug(s: str) -> str:
    return "".join(c if c.isalnum() or c in "-_" else "_" for c in s)[:80]


def generate_export(conn) -> dict[str, Any]:
    EXPORTS_DIR.mkdir(parents=True, exist_ok=True)
    stamp = _now_slug()
    export_dir = EXPORTS_DIR / f"revnexa_export_{stamp}"
    export_dir.mkdir(parents=True, exist_ok=True)

    # Mark prior generated_outputs inactive
    conn.execute("UPDATE generated_outputs SET is_current = 0 WHERE is_current = 1")

    records = conn.execute("SELECT * FROM source_records ORDER BY source_type, record_ref").fetchall()
    manifest_rows: list[dict] = []
    now = datetime.now(timezone.utc).isoformat()

    for r in records:
        rd = conn.execute(
            "SELECT * FROM routing_decisions WHERE source_record_id = ?",
            (r["id"],),
        ).fetchone()
        findings = conn.execute(
            "SELECT * FROM findings WHERE source_record_id = ? AND is_stale = 0",
            (r["id"],),
        ).fetchall()
        current_routes = _routes(rd["current_routes_json"] if rd else None)
        ai_routes = _routes(rd["ai_suggested_routes_json"] if rd else None)
        reasons = json.loads(rd["route_reasons_json"]) if rd and rd["route_reasons_json"] else []

        output_paths: list[str] = []
        folder = f"{r['source_type']}s/{_safe_slug(r['record_ref'] or r['source_id'][:8])}"
        (export_dir / folder).mkdir(parents=True, exist_ok=True)

        # Per-route draft outputs (one-to-many)
        for route in current_routes or ["No Action Required"]:
            rel = f"{folder}/{_safe_slug(route)}.md"
            body = _render_output(r, route, findings, reasons, rd)
            (export_dir / rel).write_text(body, encoding="utf-8")
            output_paths.append(rel)
            conn.execute(
                """
                INSERT INTO generated_outputs
                  (source_record_id, output_type, relative_path, generation_status,
                   analysis_version, is_current, created_at)
                VALUES (?, ?, ?, 'generated', ?, 1, ?)
                """,
                (r["id"], route, rel, r["applied_revision"], now),
            )

        gate = "Verified"
        if findings:
            statuses = {f["evidence_gate_status"] for f in findings}
            if "Invalid Evidence" in statuses:
                gate = "Invalid Evidence"
            elif "Stale" in statuses:
                gate = "Stale"
            elif "Needs Review" in statuses:
                gate = "Needs Review"

        freshness = rd["analysis_freshness"] if rd else ("current" if r["has_usable_text"] else "n/a")
        review = rd["review_status"] if rd else "pending"

        manifest_rows.append(
            {
                "source_type": r["source_type"],
                "source_id": r["source_id"],
                "record_ref": r["record_ref"],
                "applied_source_revision": r["applied_revision"],
                "title": r["title"],
                "person_label": r["person_label"],
                "transcript_available": bool(r["has_usable_text"]),
                "suggested_routes": ai_routes,
                "approved_routes": current_routes,
                "output_paths": output_paths,
                "processing_review_state": review,
                "evidence_validation_status": gate,
                "analysis_freshness": freshness,
                "manual_override": bool(rd["is_human_corrected"]) if rd else False,
                "original_ai_recommendation": ai_routes,
            }
        )

    # Shared daily summary
    summary_rel = "summaries/manager_brief_2026-08-21.md"
    (export_dir / "summaries").mkdir(exist_ok=True)
    from .brief import build_manager_brief

    brief = build_manager_brief(conn)
    (export_dir / summary_rel).write_text(brief["markdown"], encoding="utf-8")
    for row in manifest_rows:
        if row["transcript_available"]:
            row["output_paths"] = list(row["output_paths"]) + [summary_rel]

    manifest_json_path = export_dir / "manifest.json"
    manifest_csv_path = export_dir / "manifest.csv"
    manifest_json_path.write_text(json.dumps(manifest_rows, indent=2, ensure_ascii=False), encoding="utf-8")
    _write_csv(manifest_csv_path, manifest_rows)

    audit = [dict(a) for a in conn.execute("SELECT * FROM audit_events ORDER BY id").fetchall()]
    (export_dir / "audit_history.json").write_text(json.dumps(audit, indent=2), encoding="utf-8")

    zip_path = EXPORTS_DIR / f"revnexa_export_{stamp}.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in export_dir.rglob("*"):
            if path.is_file():
                zf.write(path, path.relative_to(export_dir).as_posix())

    # Verify every active path exists in archive
    with zipfile.ZipFile(zip_path, "r") as zf:
        names = set(zf.namelist())
    missing = []
    for row in manifest_rows:
        for p in row["output_paths"]:
            if p not in names:
                missing.append(p)

    return {
        "export_id": stamp,
        "directory": str(export_dir),
        "zip_path": str(zip_path),
        "manifest_json": str(manifest_json_path),
        "manifest_csv": str(manifest_csv_path),
        "record_count": len(manifest_rows),
        "missing_paths": missing,
        "ok": len(missing) == 0,
    }


def _render_output(r, route: str, findings, reasons, rd) -> str:
    lines = [
        f"# Revnexa draft output — {route}",
        "",
        f"- Source: `{r['source_type']}` / `{r['source_id']}`",
        f"- Record ref: `{r['record_ref']}`",
        f"- Applied revision: {r['applied_revision']}",
        f"- Manual override: {bool(rd['is_human_corrected']) if rd else False}",
        "",
        "> This is a **draft**. It has not been sent. No action is claimed as completed.",
        "",
        "## Route rationale",
    ]
    for reason in reasons:
        if reason.get("route") == route:
            lines.append(f"- {reason.get('reason')}")
    lines += ["", "## Evidence-backed findings"]
    if not findings:
        lines.append("- No substantive findings (missing transcript or no matched patterns).")
    for f in findings:
        cite = f"turn {f['turn_number']}" if f["turn_number"] else "exact quote"
        lines.append(f"- **{f['category']}**: {f['finding_text']}")
        lines.append(f"  - Evidence ({cite}): \"{f['evidence_quote']}\"")
        lines.append(f"  - Verification: {f['verification_status']}")
        lines.append(f"  - Gate: {f['evidence_gate_status']}")
    lines += ["", "## Limitations", "- Derived only from supplied conversation text.", ""]
    return "\n".join(lines)


def _write_csv(path: Path, rows: list[dict]) -> None:
    if not rows:
        path.write_text("", encoding="utf-8")
        return
    fieldnames = [
        "source_type",
        "source_id",
        "record_ref",
        "applied_source_revision",
        "transcript_available",
        "suggested_routes",
        "approved_routes",
        "output_paths",
        "processing_review_state",
        "evidence_validation_status",
        "analysis_freshness",
        "manual_override",
    ]
    with path.open("w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=fieldnames, extrasaction="ignore")
        w.writeheader()
        for row in rows:
            flat = dict(row)
            flat["suggested_routes"] = "|".join(row.get("suggested_routes") or [])
            flat["approved_routes"] = "|".join(row.get("approved_routes") or [])
            flat["output_paths"] = "|".join(row.get("output_paths") or [])
            w.writerow(flat)
