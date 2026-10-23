'use strict';
const { getDb } = require('./database');

function initDb() {
  const db = getDb();

  db.exec(`
    -- Source records: identity is (source_type, source_id)
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
      imported_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(source_type, source_id)
    );

    -- Import batches log
    CREATE TABLE IF NOT EXISTS import_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id TEXT NOT NULL,
      revision INTEGER NOT NULL,
      exported_at TEXT,
      record_count INTEGER NOT NULL DEFAULT 0,
      inserted_count INTEGER NOT NULL DEFAULT 0,
      updated_count INTEGER NOT NULL DEFAULT 0,
      skipped_count INTEGER NOT NULL DEFAULT 0,
      imported_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'completed'
    );

    -- Findings from analysis (per source record)
    CREATE TABLE IF NOT EXISTS findings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_record_id INTEGER NOT NULL,
      agent_stage TEXT NOT NULL,
      category TEXT NOT NULL,
      claim_text TEXT NOT NULL,
      supporting_quote TEXT,
      turn_number INTEGER,
      speaker TEXT,
      verification_status TEXT NOT NULL DEFAULT 'pending',
      verification_reason TEXT,
      requires_human_review INTEGER NOT NULL DEFAULT 0,
      source_revision_at_analysis INTEGER,
      is_stale INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY(source_record_id) REFERENCES source_records(id)
    );

    -- Evidence gate checks (per finding)
    CREATE TABLE IF NOT EXISTS evidence_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      finding_id INTEGER NOT NULL,
      check_type TEXT NOT NULL,
      check_result TEXT NOT NULL,
      check_detail TEXT,
      checked_at TEXT NOT NULL,
      gate_status TEXT NOT NULL DEFAULT 'Verified',
      FOREIGN KEY(finding_id) REFERENCES findings(id)
    );

    -- Agent workflow events (for timeline)
    CREATE TABLE IF NOT EXISTS agent_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_record_id INTEGER,
      agent_name TEXT NOT NULL,
      event_type TEXT NOT NULL,
      event_data_json TEXT,
      status TEXT NOT NULL DEFAULT 'completed',
      processing_mode TEXT NOT NULL DEFAULT 'deterministic',
      created_at TEXT NOT NULL
    );

    -- Routing decisions (Decision Memory - core persistence)
    CREATE TABLE IF NOT EXISTS routing_decisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_record_id INTEGER NOT NULL,
      finding_id INTEGER,
      ai_suggested_route TEXT,
      manager_route TEXT,
      route_rationale TEXT,
      is_human_override INTEGER NOT NULL DEFAULT 0,
      review_notes TEXT,
      decision_timestamp TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      superseded_at TEXT,
      analysis_freshness TEXT NOT NULL DEFAULT 'current',
      source_revision_at_decision INTEGER,
      FOREIGN KEY(source_record_id) REFERENCES source_records(id)
    );

    -- Export manifests
    CREATE TABLE IF NOT EXISTS export_manifests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      export_id TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      record_ref TEXT,
      applied_revision INTEGER,
      route TEXT,
      output_path TEXT,
      processing_state TEXT,
      is_manual_override INTEGER NOT NULL DEFAULT 0,
      analysis_freshness TEXT,
      exported_at TEXT NOT NULL,
      is_current INTEGER NOT NULL DEFAULT 1
    );
  `);

  console.log('[Revnexa] Database schema initialized.');
}

module.exports = { initDb };
