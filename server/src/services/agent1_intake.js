'use strict';
/**
 * Agent 1 — Intake & Evidence
 *
 * Responsibilities:
 *   - Extract usable transcript text from a source record
 *   - Determine record usability
 *   - Log agent events with real inputs/outputs
 *   - No fabrication: if there is no text, record that fact honestly
 *
 * Processing mode: deterministic (no AI model used)
 */

const { getDb } = require('../config/database');
const { AGENTS } = require('../config/constants');

/**
 * Extract transcript text from a source record.
 * Returns { text, turns, speakerMap, usable, reason }
 */
function extractEvidence(record) {
  const { source_type, payload, transcript_payload } = record;

  if (source_type === 'call') {
    const text = payload?.transcript;
    if (text && typeof text === 'string' && text.trim().length > 20) {
      return {
        text: text.trim(),
        turns: null,
        speakerMap: null,
        usable: true,
        reason: 'Call transcript text present in payload.transcript',
        textLength: text.trim().length,
      };
    }
    return {
      text: null,
      turns: null,
      speakerMap: null,
      usable: false,
      reason: payload?.transcript === null ? 'transcript field is null' : 'transcript text too short or empty',
      textLength: 0,
    };
  }

  if (source_type === 'meeting') {
    const turns = transcript_payload?.turns;
    if (Array.isArray(turns) && turns.length > 0) {
      const text = turns.map(t => t.text || '').join(' ').trim();
      if (text.length > 20) {
        const speakerMap = {};
        turns.forEach((t, i) => {
          speakerMap[t.turn || (i + 1)] = t.speaker || 'Unknown';
        });
        return {
          text,
          turns,
          speakerMap,
          usable: true,
          reason: `Meeting transcript present: ${turns.length} turns`,
          textLength: text.length,
        };
      }
    }
    return {
      text: null,
      turns: null,
      speakerMap: null,
      usable: false,
      reason: transcript_payload === null
        ? 'transcript_payload is null (no-speech or withheld)'
        : 'turns array is empty or missing',
      textLength: 0,
    };
  }

  return {
    text: null,
    turns: null,
    speakerMap: null,
    usable: false,
    reason: `Unknown source_type: ${source_type}`,
    textLength: 0,
  };
}

/**
 * Run Agent 1 for a source record. Logs events to agent_events table.
 * Returns the evidence corpus for downstream agents.
 */
function runIntakeAgent(sourceRecord) {
  const db = getDb();
  const now = new Date().toISOString();

  const logEvent = db.prepare(`
    INSERT INTO agent_events
      (source_record_id, agent_name, event_type, event_data_json, status, processing_mode, created_at)
    VALUES (?, ?, ?, ?, ?, 'deterministic', ?)
  `);

  // Event: agent started
  logEvent.run(
    sourceRecord.id,
    AGENTS.INTAKE,
    'agent_started',
    JSON.stringify({
      input: {
        source_type: sourceRecord.source_type,
        source_id: sourceRecord.source_id,
        record_ref: sourceRecord.record_ref,
        applied_revision: sourceRecord.applied_revision,
      }
    }),
    'started',
    now
  );

  let evidence;
  try {
    evidence = extractEvidence(sourceRecord);
  } catch (err) {
    logEvent.run(
      sourceRecord.id, AGENTS.INTAKE, 'extraction_error',
      JSON.stringify({ error: err.message }),
      'error', new Date().toISOString()
    );
    throw err;
  }

  // Event: extraction result
  logEvent.run(
    sourceRecord.id,
    AGENTS.INTAKE,
    'evidence_extracted',
    JSON.stringify({
      usable: evidence.usable,
      reason: evidence.reason,
      text_length: evidence.textLength,
      turn_count: evidence.turns ? evidence.turns.length : null,
    }),
    evidence.usable ? 'completed' : 'completed_no_text',
    new Date().toISOString()
  );

  // Event: handoff to Agent 2
  logEvent.run(
    sourceRecord.id,
    AGENTS.INTAKE,
    'handoff_to_intelligence',
    JSON.stringify({
      handoff_to: AGENTS.INTELLIGENCE,
      corpus_ready: evidence.usable,
      content_hash: sourceRecord.content_hash,
    }),
    'completed',
    new Date().toISOString()
  );

  return {
    sourceRecord,
    evidence,
    agentName: AGENTS.INTAKE,
  };
}

module.exports = { runIntakeAgent, extractEvidence };
