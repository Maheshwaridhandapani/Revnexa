'use strict';
/**
 * Analysis Service — orchestrates the 3-agent pipeline per source record.
 * Agent 1 (Intake) → Agent 2 (Intelligence) → Agent 3 (Routing)
 */

const { getDb } = require('../config/database');
const { runIntakeAgent } = require('./agent1_intake');
const { runIntelligenceAgent } = require('./agent2_intelligence');
const { runRoutingAgent } = require('./agent3_routing');
const { runEvidenceGate } = require('./evidenceGateService');

/**
 * Run the full analysis pipeline for a single source record.
 */
function analyzeRecord(sourceRecord) {
  try {
    const intakeResult = runIntakeAgent(sourceRecord);
    const intelligenceResult = runIntelligenceAgent(intakeResult);
    const routingResult = runRoutingAgent(intelligenceResult);

    // Run evidence gate on each finding
    const db = getDb();
    const findings = db.prepare(
      'SELECT * FROM findings WHERE source_record_id = ? AND is_stale = 0'
    ).all(sourceRecord.id);

    for (const finding of findings) {
      runEvidenceGate(finding, sourceRecord);
    }

    return {
      success: true,
      sourceRecordId: sourceRecord.id,
      findingsCount: intelligenceResult.findings.length,
      route: routingResult.route,
      humanOverridePreserved: routingResult.humanOverridePreserved,
    };
  } catch (err) {
    console.error(`[Analysis] Error processing record ${sourceRecord.id}:`, err.message);
    return {
      success: false,
      sourceRecordId: sourceRecord.id,
      error: err.message,
    };
  }
}

/**
 * Run analysis for all records that haven't been analyzed yet,
 * or for records marked stale.
 */
function analyzeAll(options = {}) {
  const db = getDb();
  const { forceReanalysis = false, sourceRecordId = null } = options;

  let records;
  if (sourceRecordId) {
    records = db.prepare('SELECT * FROM source_records WHERE id = ?').all(sourceRecordId);
  } else {
    // Records with usable text that have no findings, or have stale findings
    records = db.prepare(`
      SELECT sr.*
      FROM source_records sr
      WHERE sr.has_usable_text = 1
        AND (
          NOT EXISTS (SELECT 1 FROM findings f WHERE f.source_record_id = sr.id)
          OR EXISTS (SELECT 1 FROM findings f WHERE f.source_record_id = sr.id AND f.is_stale = 1)
        )
    `).all();
  }

  const results = [];
  for (const row of records) {
    const sourceRecord = {
      ...row,
      payload: JSON.parse(row.payload_json),
      transcript_payload: row.transcript_payload_json ? JSON.parse(row.transcript_payload_json) : null,
    };
    results.push(analyzeRecord(sourceRecord));
  }

  return results;
}

/**
 * Re-analyze a single record by ID (e.g. after stale flag).
 */
function reanalyzeRecord(sourceRecordId) {
  const db = getDb();

  // Clear existing stale findings for this record
  db.prepare('DELETE FROM findings WHERE source_record_id = ? AND is_stale = 1').run(sourceRecordId);
  // Delete non-stale findings too (full re-analysis)
  db.prepare('DELETE FROM evidence_checks WHERE finding_id IN (SELECT id FROM findings WHERE source_record_id = ?)').run(sourceRecordId);
  db.prepare('DELETE FROM findings WHERE source_record_id = ?').run(sourceRecordId);

  const row = db.prepare('SELECT * FROM source_records WHERE id = ?').get(sourceRecordId);
  if (!row) throw new Error(`Source record ${sourceRecordId} not found`);

  const sourceRecord = {
    ...row,
    payload: JSON.parse(row.payload_json),
    transcript_payload: row.transcript_payload_json ? JSON.parse(row.transcript_payload_json) : null,
  };

  return analyzeRecord(sourceRecord);
}

module.exports = { analyzeRecord, analyzeAll, reanalyzeRecord };
