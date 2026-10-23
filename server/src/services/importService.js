'use strict';
/**
 * Import Service — Revnexa
 *
 * Implements DATA_CONTRACT import rules:
 *   1. Identity is (source_type, source_id) — never keyed by name/position/record_ref
 *   2. Revision check: same-or-older revisions are silently ignored
 *   3. Full payload replace on upsert (not partial merge)
 *   4. Content hash: when transcript text changes, mark linked findings stale
 *   5. Human routing decisions are never erased by a re-import
 */

const { getDb } = require('../config/database');
const { FRESHNESS } = require('../config/constants');
const crypto = require('crypto');

/**
 * Compute a SHA-256 hash of transcript text (for stale detection).
 * Returns null if no usable text.
 */
function computeContentHash(record) {
  let text = null;

  if (record.source_type === 'call') {
    text = record.payload?.transcript || null;
  } else if (record.source_type === 'meeting') {
    const turns = record.transcript_payload?.turns;
    if (Array.isArray(turns) && turns.length > 0) {
      text = turns.map(t => t.text || '').join(' ');
    }
  }

  if (!text || text.trim().length < 10) return null;
  return crypto.createHash('sha256').update(text.trim()).digest('hex');
}

/**
 * Extract full transcript text for usability check.
 */
function extractTranscriptText(record) {
  if (record.source_type === 'call') {
    return record.payload?.transcript || null;
  } else if (record.source_type === 'meeting') {
    const turns = record.transcript_payload?.turns;
    if (Array.isArray(turns) && turns.length > 0) {
      return turns.map(t => t.text || '').join(' ');
    }
  }
  return null;
}

/**
 * Import a delivery batch into the database.
 * Returns a summary { batchId, revision, inserted, updated, skipped, total }
 */
function importBatch(delivery) {
  const db = getDb();

  const { batch_id, revision, exported_at, records } = delivery;

  if (!batch_id || typeof revision !== 'number' || !Array.isArray(records)) {
    throw new Error('Invalid delivery envelope: missing batch_id, revision, or records array.');
  }

  const now = new Date().toISOString();
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  // Log the import batch attempt
  const batchInsert = db.prepare(`
    INSERT INTO import_batches
      (batch_id, revision, exported_at, record_count, inserted_count, updated_count, skipped_count, imported_at, status)
    VALUES (?, ?, ?, ?, 0, 0, 0, ?, 'in_progress')
  `);
  const batchResult = batchInsert.run(batch_id, revision, exported_at || null, records.length, now);
  const batchRowId = batchResult.lastInsertRowid;

  const findRecord = db.prepare(
    'SELECT id, applied_revision, content_hash FROM source_records WHERE source_type = ? AND source_id = ?'
  );

  const insertRecord = db.prepare(`
    INSERT INTO source_records
      (source_type, source_id, record_ref, applied_revision, payload_json, transcript_payload_json,
       content_hash, has_usable_text, imported_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const updateRecord = db.prepare(`
    UPDATE source_records
    SET record_ref = ?,
        applied_revision = ?,
        payload_json = ?,
        transcript_payload_json = ?,
        content_hash = ?,
        has_usable_text = ?,
        updated_at = ?
    WHERE source_type = ? AND source_id = ?
  `);

  const markFindingsStale = db.prepare(`
    UPDATE findings SET is_stale = 1, verification_status = 'Stale — source changed'
    WHERE source_record_id = ? AND is_stale = 0
  `);

  const markRoutingStale = db.prepare(`
    UPDATE routing_decisions
    SET analysis_freshness = 'stale'
    WHERE source_record_id = ? AND is_active = 1 AND is_human_override = 0
  `);

  // Flag human-override decisions for review (don't erase — just notify)
  const flagHumanDecisionsForReview = db.prepare(`
    UPDATE routing_decisions
    SET analysis_freshness = 'pending-review'
    WHERE source_record_id = ? AND is_active = 1 AND is_human_override = 1
  `);

  // Process records in a transaction for atomicity
  const processAll = db.transaction(() => {
    for (const record of records) {
      const { source_type, source_id, record_ref, payload, transcript_payload } = record;

      if (!source_type || !source_id) {
        console.warn(`[Import] Skipping record with missing source_type or source_id`);
        skipped++;
        continue;
      }

      // Rule 2: Check existing revision
      const existing = findRecord.get(source_type, source_id);

      if (existing && existing.applied_revision >= revision) {
        // Same or older revision — ignore completely
        skipped++;
        continue;
      }

      const newHash = computeContentHash(record);
      const hasUsableText = newHash !== null ? 1 : 0;
      const payloadJson = JSON.stringify(payload || {});
      const transcriptJson = transcript_payload ? JSON.stringify(transcript_payload) : null;

      if (!existing) {
        // New record — insert
        insertRecord.run(
          source_type,
          source_id,
          record_ref || null,
          revision,
          payloadJson,
          transcriptJson,
          newHash,
          hasUsableText,
          now,
          now
        );
        inserted++;
      } else {
        // Existing record with older revision — update (Rule 3: full replace)
        const contentChanged = newHash !== existing.content_hash;

        updateRecord.run(
          record_ref || null,
          revision,
          payloadJson,
          transcriptJson,
          newHash,
          hasUsableText,
          now,
          source_type,
          source_id
        );

        if (contentChanged) {
          // Transcript text changed: mark findings stale (Rule 5)
          markFindingsStale.run(existing.id);

          // Mark AI-suggested routes stale (but preserve human overrides with a review flag)
          markRoutingStale.run(existing.id);
          flagHumanDecisionsForReview.run(existing.id);
        }

        updated++;
      }
    }
  });

  processAll();

  // Update batch log with final counts
  db.prepare(`
    UPDATE import_batches
    SET inserted_count = ?, updated_count = ?, skipped_count = ?, status = 'completed'
    WHERE id = ?
  `).run(inserted, updated, skipped, batchRowId);

  return {
    batchId: batch_id,
    revision,
    total: records.length,
    inserted,
    updated,
    skipped,
    importedAt: now,
  };
}

/**
 * List all import batches (newest first).
 */
function listBatches() {
  const db = getDb();
  return db.prepare('SELECT * FROM import_batches ORDER BY imported_at DESC').all();
}

/**
 * List all source records.
 */
function listRecords(filters = {}) {
  const db = getDb();
  let sql = 'SELECT * FROM source_records ORDER BY source_type, record_ref';
  const rows = db.prepare(sql).all();

  return rows.map(row => ({
    ...row,
    payload: JSON.parse(row.payload_json),
    transcript_payload: row.transcript_payload_json ? JSON.parse(row.transcript_payload_json) : null,
  }));
}

/**
 * Get a single source record by id.
 */
function getRecord(id) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM source_records WHERE id = ?').get(id);
  if (!row) return null;
  return {
    ...row,
    payload: JSON.parse(row.payload_json),
    transcript_payload: row.transcript_payload_json ? JSON.parse(row.transcript_payload_json) : null,
  };
}

/**
 * Get a source record by (source_type, source_id).
 */
function getRecordByIdentity(sourceType, sourceId) {
  const db = getDb();
  const row = db.prepare(
    'SELECT * FROM source_records WHERE source_type = ? AND source_id = ?'
  ).get(sourceType, sourceId);
  if (!row) return null;
  return {
    ...row,
    payload: JSON.parse(row.payload_json),
    transcript_payload: row.transcript_payload_json ? JSON.parse(row.transcript_payload_json) : null,
  };
}

module.exports = { importBatch, listBatches, listRecords, getRecord, getRecordByIdentity };
