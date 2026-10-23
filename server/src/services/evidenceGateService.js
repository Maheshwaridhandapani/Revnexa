'use strict';
/**
 * Evidence Gate Service — Signature Feature 2
 *
 * Runs 9 validation checks on each finding before it reaches manager approval.
 * Preserves original AI output even when gate fails.
 * Never silently replaces missing evidence with invented text.
 */

const { getDb } = require('../config/database');
const { GATE_STATUS, VERIFICATION } = require('../config/constants');

const CHECKS = [
  'source_record_existence',
  'correct_source_identity',
  'quote_presence_in_transcript',
  'source_version_match',
  'content_hash_validity',
  'analysis_freshness',
  'structured_output_validity',
  'routing_rationale_present',
  'conflict_check',
];

/**
 * Run all evidence gate checks for a finding.
 * Returns an array of check results and an overall gate_status.
 */
function runEvidenceGate(finding, sourceRecord) {
  const db = getDb();
  const now = new Date().toISOString();

  const insertCheck = db.prepare(`
    INSERT INTO evidence_checks
      (finding_id, check_type, check_result, check_detail, checked_at, gate_status)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const checkResults = [];
  let overallStatus = GATE_STATUS.VERIFIED;

  // 1. Source record existence
  const srExists = !!sourceRecord;
  const check1 = {
    type: 'source_record_existence',
    passed: srExists,
    detail: srExists ? 'Source record exists in database.' : 'Source record not found.',
    gate_status: srExists ? GATE_STATUS.VERIFIED : GATE_STATUS.INVALID,
  };
  checkResults.push(check1);
  insertCheck.run(finding.id, check1.type, check1.passed ? 'pass' : 'fail', check1.detail, now, check1.gate_status);
  if (!check1.passed) overallStatus = GATE_STATUS.INVALID;

  // 2. Correct source identity
  const identityOk = srExists &&
    sourceRecord.source_type && sourceRecord.source_id &&
    sourceRecord.id === finding.source_record_id;
  const check2 = {
    type: 'correct_source_identity',
    passed: identityOk,
    detail: identityOk
      ? `Identity confirmed: (${sourceRecord.source_type}, ${sourceRecord.source_id})`
      : 'Source identity mismatch or missing.',
    gate_status: identityOk ? GATE_STATUS.VERIFIED : GATE_STATUS.INVALID,
  };
  checkResults.push(check2);
  insertCheck.run(finding.id, check2.type, check2.passed ? 'pass' : 'fail', check2.detail, now, check2.gate_status);
  if (!check2.passed && overallStatus === GATE_STATUS.VERIFIED) overallStatus = GATE_STATUS.INVALID;

  // 3. Quote presence in transcript
  let quoteCheck;
  if (!finding.supporting_quote || finding.supporting_quote.trim().length === 0) {
    quoteCheck = {
      type: 'quote_presence_in_transcript',
      passed: false,
      detail: 'No supporting quote was extracted for this finding.',
      gate_status: GATE_STATUS.NEEDS_REVIEW,
    };
  } else if (srExists) {
    // Get transcript text
    let transcriptText = '';
    if (sourceRecord.source_type === 'call') {
      transcriptText = sourceRecord.payload?.transcript || '';
    } else if (sourceRecord.transcript_payload?.turns) {
      transcriptText = sourceRecord.transcript_payload.turns.map(t => t.text || '').join(' ');
    }
    const normalText = transcriptText.toLowerCase().replace(/\s+/g, ' ');
    const normalQuote = finding.supporting_quote.toLowerCase().replace(/\s+/g, ' ');
    const keyPhrase = normalQuote.slice(0, 40);
    const found = normalText.includes(normalQuote) || normalText.includes(keyPhrase);

    quoteCheck = {
      type: 'quote_presence_in_transcript',
      passed: found,
      detail: found
        ? 'Supporting quote located in source transcript.'
        : 'Supporting quote NOT found in source transcript. May reference omitted section.',
      gate_status: found ? GATE_STATUS.VERIFIED : GATE_STATUS.INVALID,
    };
  } else {
    quoteCheck = {
      type: 'quote_presence_in_transcript',
      passed: false,
      detail: 'Cannot verify: source record unavailable.',
      gate_status: GATE_STATUS.INVALID,
    };
  }
  checkResults.push(quoteCheck);
  insertCheck.run(finding.id, quoteCheck.type, quoteCheck.passed ? 'pass' : 'fail', quoteCheck.detail, now, quoteCheck.gate_status);
  if (!quoteCheck.passed && overallStatus === GATE_STATUS.VERIFIED) {
    overallStatus = quoteCheck.gate_status;
  }

  // 4. Source version match
  const versionMatch = srExists &&
    finding.source_revision_at_analysis === sourceRecord.applied_revision;
  const check4 = {
    type: 'source_version_match',
    passed: versionMatch,
    detail: versionMatch
      ? `Analysis revision (${finding.source_revision_at_analysis}) matches current source revision (${sourceRecord.applied_revision}).`
      : `Analysis was done at revision ${finding.source_revision_at_analysis}, current is ${sourceRecord.applied_revision}.`,
    gate_status: versionMatch ? GATE_STATUS.VERIFIED : GATE_STATUS.STALE,
  };
  checkResults.push(check4);
  insertCheck.run(finding.id, check4.type, check4.passed ? 'pass' : 'fail', check4.detail, now, check4.gate_status);
  if (!check4.passed && overallStatus === GATE_STATUS.VERIFIED) overallStatus = GATE_STATUS.STALE;

  // 5. Content hash validity
  const hashOk = srExists && sourceRecord.content_hash !== null;
  const check5 = {
    type: 'content_hash_validity',
    passed: hashOk,
    detail: hashOk
      ? `Content hash present: ${sourceRecord.content_hash.slice(0, 16)}...`
      : 'No content hash available (record may have no usable text).',
    gate_status: hashOk ? GATE_STATUS.VERIFIED : GATE_STATUS.NEEDS_REVIEW,
  };
  checkResults.push(check5);
  insertCheck.run(finding.id, check5.type, check5.passed ? 'pass' : 'fail', check5.detail, now, check5.gate_status);

  // 6. Analysis freshness
  const isFresh = finding.is_stale === 0;
  const check6 = {
    type: 'analysis_freshness',
    passed: isFresh,
    detail: isFresh
      ? 'Finding is current (not marked stale).'
      : 'Finding is stale — source transcript was updated after this analysis was run.',
    gate_status: isFresh ? GATE_STATUS.VERIFIED : GATE_STATUS.STALE,
  };
  checkResults.push(check6);
  insertCheck.run(finding.id, check6.type, check6.passed ? 'pass' : 'fail', check6.detail, now, check6.gate_status);
  if (!check6.passed && overallStatus === GATE_STATUS.VERIFIED) overallStatus = GATE_STATUS.STALE;

  // 7. Structured output validity
  const outputValid = !!(finding.category && finding.claim_text && finding.verification_status);
  const check7 = {
    type: 'structured_output_validity',
    passed: outputValid,
    detail: outputValid
      ? 'All required finding fields (category, claim_text, verification_status) are present.'
      : 'Finding is missing required fields.',
    gate_status: outputValid ? GATE_STATUS.VERIFIED : GATE_STATUS.INVALID,
  };
  checkResults.push(check7);
  insertCheck.run(finding.id, check7.type, check7.passed ? 'pass' : 'fail', check7.detail, now, check7.gate_status);
  if (!check7.passed && overallStatus === GATE_STATUS.VERIFIED) overallStatus = GATE_STATUS.INVALID;

  // 8. Routing rationale present
  const routingDecision = db.prepare(
    'SELECT route_rationale FROM routing_decisions WHERE source_record_id = ? AND is_active = 1 LIMIT 1'
  ).get(finding.source_record_id);
  const rationaleOk = routingDecision && routingDecision.route_rationale && routingDecision.route_rationale.length > 10;
  const check8 = {
    type: 'routing_rationale_present',
    passed: !!rationaleOk,
    detail: rationaleOk
      ? 'Active routing decision has a rationale.'
      : 'No active routing decision or rationale is missing.',
    gate_status: rationaleOk ? GATE_STATUS.VERIFIED : GATE_STATUS.NEEDS_REVIEW,
  };
  checkResults.push(check8);
  insertCheck.run(finding.id, check8.type, check8.passed ? 'pass' : 'fail', check8.detail, now, check8.gate_status);

  // 9. Conflict check (simple: check for both "no-interest" and "partnership" in same record)
  const conflictingFindings = db.prepare(`
    SELECT category FROM findings
    WHERE source_record_id = ? AND id != ? AND is_stale = 0
  `).all(finding.source_record_id, finding.id);

  const categories = conflictingFindings.map(f => f.category);
  const hasNoInterest = categories.includes('no-interest') || finding.category === 'no-interest';
  const hasPartnership = categories.includes('partnership-interest') || finding.category === 'partnership-interest';
  const conflict = hasNoInterest && hasPartnership;
  const check9 = {
    type: 'conflict_check',
    passed: !conflict,
    detail: conflict
      ? 'Conflicting signals: both "no interest" and "partnership interest" detected in same record. Human review required.'
      : 'No conflicting signals detected.',
    gate_status: conflict ? GATE_STATUS.NEEDS_REVIEW : GATE_STATUS.VERIFIED,
  };
  checkResults.push(check9);
  insertCheck.run(finding.id, check9.type, check9.passed ? 'pass' : 'fail', check9.detail, now, check9.gate_status);

  return { checkResults, overallStatus };
}

/**
 * Get all evidence checks for a finding.
 */
function getChecksForFinding(findingId) {
  const db = getDb();
  return db.prepare('SELECT * FROM evidence_checks WHERE finding_id = ? ORDER BY id').all(findingId);
}

/**
 * Get the aggregate gate status for a finding (worst-case of all checks).
 */
function getAggregateGateStatus(findingId) {
  const db = getDb();
  const checks = db.prepare('SELECT gate_status FROM evidence_checks WHERE finding_id = ?').all(findingId);
  if (checks.length === 0) return null;

  const priority = { Verified: 0, 'Needs Review': 1, Stale: 2, 'Invalid Evidence': 3 };
  let worst = GATE_STATUS.VERIFIED;
  for (const c of checks) {
    if ((priority[c.gate_status] || 0) > (priority[worst] || 0)) {
      worst = c.gate_status;
    }
  }
  return worst;
}

module.exports = { runEvidenceGate, getChecksForFinding, getAggregateGateStatus };
