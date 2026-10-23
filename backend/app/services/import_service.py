"""Incremental import with (source_type, source_id) identity and revision rules."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ..config import INITIAL_FILE, UPDATE_FILE
from .transcript_utils import (
    activity_at,
    content_hash,
    display_title,
    dumps,
    extract_usable_text,
    person_label,
)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_delivery(path: Path) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("Delivery must be a JSON object")
    if "batch_id" not in data or "revision" not in data or "records" not in data:
        raise ValueError("Invalid delivery envelope: need batch_id, revision, records")
    if not isinstance(data["records"], list):
        raise ValueError("records must be an array")
    return data


def import_delivery(
    conn,
    delivery: dict,
    *,
    file_name: str | None = None,
    shuffle_order: bool = False,
) -> dict[str, Any]:
    """Apply delivery under DATA_CONTRACT rules. Preserves human route corrections."""
    batch_id = delivery["batch_id"]
    revision = int(delivery["revision"])
    exported_at = delivery.get("exported_at")
    records = list(delivery["records"])
    if shuffle_order:
        records = list(reversed(records))

    now = _now()
    inserted = updated = unchanged = rejected = 0
    errors: list[str] = []

    cur = conn.execute(
        """
        INSERT INTO import_batches
          (batch_id, file_name, revision, exported_at, record_count,
           inserted_count, updated_count, unchanged_count, rejected_count,
           validation_errors_json, imported_at, status)
        VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0, '[]', ?, 'in_progress')
        """,
        (batch_id, file_name, revision, exported_at, len(records), now),
    )
    batch_row_id = cur.lastrowid

    try:
        for record in records:
            try:
                source_type = record.get("source_type")
                source_id = record.get("source_id")
                if not source_type or not source_id:
                    rejected += 1
                    errors.append("Missing source_type or source_id")
                    continue

                payload = record.get("payload") or {}
                transcript_payload = record.get("transcript_payload")
                record_ref = record.get("record_ref")
                new_hash = content_hash(source_type, payload, transcript_payload)
                usable = 1 if extract_usable_text(source_type, payload, transcript_payload) else 0
                title = display_title(source_type, payload, record_ref)
                person = person_label(source_type, payload)
                when = activity_at(source_type, payload)

                existing = conn.execute(
                    "SELECT * FROM source_records WHERE source_type = ? AND source_id = ?",
                    (source_type, source_id),
                ).fetchone()

                if existing and existing["applied_revision"] >= revision:
                    unchanged += 1
                    continue

                if not existing:
                    conn.execute(
                        """
                        INSERT INTO source_records
                          (source_type, source_id, record_ref, applied_revision,
                           payload_json, transcript_payload_json, content_hash,
                           has_usable_text, title, person_label, activity_at,
                           imported_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            source_type,
                            source_id,
                            record_ref,
                            revision,
                            dumps(payload),
                            dumps(transcript_payload) if transcript_payload is not None else None,
                            new_hash,
                            usable,
                            title,
                            person,
                            when,
                            now,
                            now,
                        ),
                    )
                    inserted += 1
                    sid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
                    conn.execute(
                        """
                        INSERT INTO audit_events
                          (source_record_id, event_type, previous_value, new_value, actor, created_at)
                        VALUES (?, 'source_inserted', NULL, ?, 'intake-agent', ?)
                        """,
                        (sid, f"rev={revision}", now),
                    )
                else:
                    old_hash = existing["content_hash"]
                    conn.execute(
                        """
                        UPDATE source_records SET
                          record_ref = ?, applied_revision = ?, payload_json = ?,
                          transcript_payload_json = ?, content_hash = ?, has_usable_text = ?,
                          title = ?, person_label = ?, activity_at = ?, updated_at = ?
                        WHERE id = ?
                        """,
                        (
                            record_ref,
                            revision,
                            dumps(payload),
                            dumps(transcript_payload) if transcript_payload is not None else None,
                            new_hash,
                            usable,
                            title,
                            person,
                            when,
                            now,
                            existing["id"],
                        ),
                    )
                    updated += 1
                    if new_hash != old_hash:
                        # Mark analyses/findings stale; never erase human corrections
                        conn.execute(
                            """
                            UPDATE findings SET is_stale = 1,
                              verification_status = 'Stale — source changed',
                              evidence_gate_status = 'Stale'
                            WHERE source_record_id = ? AND is_stale = 0
                            """,
                            (existing["id"],),
                        )
                        conn.execute(
                            """
                            UPDATE analysis_results SET analysis_freshness = 'stale',
                              processing_status = 'needs_review'
                            WHERE source_record_id = ?
                            """,
                            (existing["id"],),
                        )
                        # Human decisions: flag for review, keep routes
                        conn.execute(
                            """
                            UPDATE routing_decisions
                            SET analysis_freshness = CASE
                                  WHEN is_human_corrected = 1 THEN 'pending-review'
                                  ELSE 'stale'
                                END,
                                updated_at = ?
                            WHERE source_record_id = ?
                            """,
                            (now, existing["id"]),
                        )
                        conn.execute(
                            """
                            INSERT INTO audit_events
                              (source_record_id, event_type, previous_value, new_value, actor, created_at)
                            VALUES (?, 'source_content_changed', ?, ?, 'intake-agent', ?)
                            """,
                            (existing["id"], old_hash, new_hash, now),
                        )
                    else:
                        conn.execute(
                            """
                            INSERT INTO audit_events
                              (source_record_id, event_type, previous_value, new_value, actor, created_at)
                            VALUES (?, 'source_revision_applied', ?, ?, 'intake-agent', ?)
                            """,
                            (existing["id"], str(existing["applied_revision"]), str(revision), now),
                        )

                # Agent 1 event
                src = conn.execute(
                    "SELECT id FROM source_records WHERE source_type = ? AND source_id = ?",
                    (source_type, source_id),
                ).fetchone()
                conn.execute(
                    """
                    INSERT INTO agent_events
                      (source_record_id, import_batch_id, agent_name, event_type,
                       inputs_json, outputs_json, status, processing_mode, created_at)
                    VALUES (?, ?, 'Intake & Evidence', 'record_processed', ?, ?, 'completed', 'deterministic', ?)
                    """,
                    (
                        src["id"] if src else None,
                        batch_row_id,
                        dumps({"source_type": source_type, "source_id": source_id, "revision": revision}),
                        dumps({"has_usable_text": bool(usable), "content_hash": new_hash}),
                        now,
                    ),
                )
            except Exception as exc:  # noqa: BLE001 — collect per-record failures
                rejected += 1
                errors.append(str(exc))

        conn.execute(
            """
            UPDATE import_batches SET
              inserted_count = ?, updated_count = ?, unchanged_count = ?,
              rejected_count = ?, validation_errors_json = ?, status = 'completed'
            WHERE id = ?
            """,
            (inserted, updated, unchanged, rejected, dumps(errors), batch_row_id),
        )
    except Exception:
        conn.execute(
            "UPDATE import_batches SET status = 'failed', validation_errors_json = ? WHERE id = ?",
            (dumps(errors + ["transaction failed"]), batch_row_id),
        )
        raise

    return {
        "batch_id": batch_id,
        "file_name": file_name,
        "revision": revision,
        "record_count": len(records),
        "inserted": inserted,
        "updated": updated,
        "unchanged": unchanged,
        "rejected": rejected,
        "validation_errors": errors,
        "imported_at": now,
        "status": "completed",
    }


def import_file(conn, path: Path, *, shuffle_order: bool = False) -> dict:
    delivery = load_delivery(path)
    return import_delivery(conn, delivery, file_name=path.name, shuffle_order=shuffle_order)


def import_initial(conn, *, shuffle_order: bool = False) -> dict:
    return import_file(conn, INITIAL_FILE, shuffle_order=shuffle_order)


def import_update(conn) -> dict:
    return import_file(conn, UPDATE_FILE)
