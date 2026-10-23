"""SQLite persistence for Revnexa — FKs, unique identity, transactions."""
from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from .config import DB_PATH

SCHEMA = """
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  hashed_password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS source_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  record_ref TEXT,
  applied_revision INTEGER NOT NULL DEFAULT 1,
  payload_json TEXT NOT NULL,
  transcript_payload_json TEXT,
  content_hash TEXT,
  has_usable_text INTEGER NOT NULL DEFAULT 0,
  title TEXT,
  person_label TEXT,
  activity_at TEXT,
  imported_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(source_type, source_id)
);
CREATE INDEX IF NOT EXISTS idx_source_type ON source_records(source_type);
CREATE INDEX IF NOT EXISTS idx_usable ON source_records(has_usable_text);
CREATE INDEX IF NOT EXISTS idx_person ON source_records(person_label);

CREATE TABLE IF NOT EXISTS import_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id TEXT NOT NULL,
  file_name TEXT,
  revision INTEGER NOT NULL,
  exported_at TEXT,
  record_count INTEGER NOT NULL DEFAULT 0,
  inserted_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  unchanged_count INTEGER NOT NULL DEFAULT 0,
  rejected_count INTEGER NOT NULL DEFAULT 0,
  validation_errors_json TEXT,
  imported_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed'
);

CREATE TABLE IF NOT EXISTS analysis_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_record_id INTEGER NOT NULL,
  agent_stage TEXT NOT NULL,
  result_json TEXT NOT NULL,
  source_hash TEXT,
  source_revision INTEGER,
  evidence_gate_status TEXT,
  processing_status TEXT NOT NULL DEFAULT 'complete',
  analysis_freshness TEXT NOT NULL DEFAULT 'current',
  created_at TEXT NOT NULL,
  FOREIGN KEY(source_record_id) REFERENCES source_records(id)
);
CREATE INDEX IF NOT EXISTS idx_analysis_source ON analysis_results(source_record_id);

CREATE TABLE IF NOT EXISTS findings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_record_id INTEGER NOT NULL,
  analysis_id INTEGER,
  category TEXT NOT NULL,
  finding_text TEXT NOT NULL,
  evidence_quote TEXT,
  turn_number INTEGER,
  speaker TEXT,
  relevance TEXT,
  limitations TEXT,
  verification_status TEXT NOT NULL DEFAULT 'Needs human review',
  verification_reason TEXT,
  requires_human_review INTEGER NOT NULL DEFAULT 0,
  evidence_gate_status TEXT NOT NULL DEFAULT 'Needs Review',
  source_hash TEXT,
  source_revision INTEGER,
  is_stale INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY(source_record_id) REFERENCES source_records(id),
  FOREIGN KEY(analysis_id) REFERENCES analysis_results(id)
);
CREATE INDEX IF NOT EXISTS idx_findings_source ON findings(source_record_id);
CREATE INDEX IF NOT EXISTS idx_findings_status ON findings(verification_status);

CREATE TABLE IF NOT EXISTS routing_decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_record_id INTEGER NOT NULL UNIQUE,
  ai_suggested_routes_json TEXT NOT NULL,
  current_routes_json TEXT NOT NULL,
  route_reasons_json TEXT,
  is_human_corrected INTEGER NOT NULL DEFAULT 0,
  review_status TEXT NOT NULL DEFAULT 'pending',
  review_note TEXT,
  analysis_freshness TEXT NOT NULL DEFAULT 'current',
  source_revision_at_decision INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(source_record_id) REFERENCES source_records(id)
);

CREATE TABLE IF NOT EXISTS decision_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_record_id INTEGER NOT NULL,
  previous_routes_json TEXT,
  new_routes_json TEXT,
  actor TEXT NOT NULL DEFAULT 'manager',
  note TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(source_record_id) REFERENCES source_records(id)
);

CREATE TABLE IF NOT EXISTS agent_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_record_id INTEGER,
  import_batch_id INTEGER,
  agent_name TEXT NOT NULL,
  event_type TEXT NOT NULL,
  inputs_json TEXT,
  outputs_json TEXT,
  status TEXT NOT NULL DEFAULT 'completed',
  processing_mode TEXT NOT NULL DEFAULT 'deterministic',
  error_text TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_record_id INTEGER,
  event_type TEXT NOT NULL,
  previous_value TEXT,
  new_value TEXT,
  actor TEXT NOT NULL DEFAULT 'system',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS generated_outputs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_record_id INTEGER,
  output_type TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  generation_status TEXT NOT NULL DEFAULT 'generated',
  analysis_version INTEGER,
  is_current INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  FOREIGN KEY(source_record_id) REFERENCES source_records(id)
);

CREATE TABLE IF NOT EXISTS replay_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
"""


def connect(db_path: Path | None = None) -> sqlite3.Connection:
    path = Path(db_path or DB_PATH)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db(db_path: Path | None = None) -> None:
    conn = connect(db_path)
    try:
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()


@contextmanager
def get_connection(db_path: Path | None = None) -> Iterator[sqlite3.Connection]:
    conn = connect(db_path)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
