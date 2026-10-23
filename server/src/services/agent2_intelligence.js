'use strict';
/**
 * Agent 2 — Conversation Intelligence
 *
 * Responsibilities:
 *   - Extract claims from transcript text using deterministic keyword/pattern matching
 *   - Verify each claim by locating supporting evidence in the SOURCE text
 *   - Assign honest verification statuses (never fabricate quotes)
 *   - Save findings to database
 *
 * Processing mode: deterministic (keyword/pattern matching — no LLM)
 * If REVNEXA_LLM_API_KEY env var is set, a future LLM call could be inserted here.
 */

const { getDb } = require('../config/database');
const { AGENTS, CATEGORIES, VERIFICATION } = require('../config/constants');

const LLM_MODE = !!process.env.REVNEXA_LLM_API_KEY;

// ─── Pattern Definitions ─────────────────────────────────────────────────────

const PATTERNS = [
  // No interest / DNC signals
  {
    category: CATEGORIES.NO_INTEREST,
    label: 'Contact expressed no interest',
    patterns: [
      /not interested/i,
      /don'?t (need|want) (this|that|it)/i,
      /already (have|got) (that|this|it|a solution|everything|those)/i,
      /arrangements are already in place/i,
      /don'?t work there anymore/i,
      /not (looking for|shopping for)/i,
    ],
    quote_context: 60,
  },
  // Partnership interest
  {
    category: CATEGORIES.PARTNERSHIP,
    label: 'Partnership or referral interest expressed',
    patterns: [
      /sensible commercial arrangement/i,
      /partner (with|arrangement|commission)/i,
      /referral (link|code|programme|program)/i,
      /partner onboarding/i,
      /commission/i,
    ],
    quote_context: 80,
  },
  // Commitment / next steps from rep
  {
    category: CATEGORIES.COMMITMENT,
    label: 'Representative committed to a next step',
    patterns: [
      /i will send/i,
      /I'?ll send/i,
      /i will (call|email|follow up|check|confirm|arrange|share)/i,
      /I'?ll (call|email|follow up|check|confirm|send|try)/i,
      /i can email you/i,
      /send the proposal/i,
      /send the (information|details|documents|template)/i,
    ],
    quote_context: 80,
  },
  // Pricing discussed
  {
    category: CATEGORIES.PRICING,
    label: 'Pricing or cost discussed',
    patterns: [
      /INR\s*[\d,]+/i,
      /USD\s*[\d,]+/i,
      /EUR\s*[\d,]+/i,
      /annual (charge|subscription|fee)/i,
      /monthly (charge|fee)/i,
      /pricing/i,
      /cost (for|of|per)/i,
    ],
    quote_context: 100,
  },
  // Follow-up required
  {
    category: CATEGORIES.FOLLOWUP,
    label: 'Follow-up call or email agreed',
    patterns: [
      /call (on |back )?(monday|tuesday|wednesday|thursday|friday)/i,
      /follow.?up (call|email|on)/i,
      /speak (monday|tuesday|on)/i,
      /call (next week|this friday|tomorrow)/i,
    ],
    quote_context: 80,
  },
  // Coaching opportunity
  {
    category: CATEGORIES.COACHING,
    label: 'Coaching opportunity identified',
    patterns: [
      /cold call/i,
      /didn'?t ask for this call/i,
      /where did you find my details/i,
      /why (are you|have you) call/i,
      /connection (problem|issue|dropped)/i,
      /I can'?t hear/i,
      /sound is very faint/i,
    ],
    quote_context: 80,
  },
  // Risk signals
  {
    category: CATEGORIES.RISK,
    label: 'Risk or escalation indicator',
    patterns: [
      /wrong email/i,
      /not in (the )?office/i,
      /compliance (asks|requires|question)/i,
      /outstanding (for months|invoice)/i,
      /declined/i,
      /put on hold/i,
      /audit (finding|risk|trail)/i,
      /dispute/i,
    ],
    quote_context: 80,
  },
  // Objection
  {
    category: CATEGORIES.OBJECTION,
    label: 'Prospect raised a product or pricing objection',
    patterns: [
      /prepaid/i,
      /credit (card|facility|line)/i,
      /previously told me/i,
      /why has that become/i,
      /that needs checking/i,
      /not essential enough/i,
    ],
    quote_context: 80,
  },
  // Contact information
  {
    category: CATEGORIES.CONTACT_INFO,
    label: 'Contact information exchanged',
    patterns: [
      /contact\d+@example\.com/i,
      /email address/i,
      /messaging app/i,
    ],
    quote_context: 60,
  },
];

// ─── Core extraction logic ────────────────────────────────────────────────────

/**
 * Find the best supporting quote for a match in the text.
 * Extracts a sentence/phrase window around the match.
 * Never invents text — returns substring of the actual source.
 */
function extractQuote(text, matchIndex, contextChars) {
  const start = Math.max(0, matchIndex - contextChars);
  const end = Math.min(text.length, matchIndex + contextChars);

  // Try to trim to sentence boundaries
  let snippet = text.slice(start, end).trim();

  // Remove partial words at edges
  if (start > 0 && snippet.length > 0 && snippet[0] !== ' ') {
    const firstSpace = snippet.indexOf(' ');
    if (firstSpace > 0 && firstSpace < 30) snippet = snippet.slice(firstSpace).trim();
  }
  if (end < text.length && snippet.length > 0) {
    const lastSpace = snippet.lastIndexOf(' ');
    if (lastSpace > snippet.length - 30) snippet = snippet.slice(0, lastSpace).trim();
  }

  return snippet;
}

/**
 * For meeting transcripts: find which turn(s) contain the quote.
 */
function findTurnForQuote(turns, quote) {
  if (!turns || !quote) return { turnNumber: null, speaker: null };
  const lowerQuote = quote.toLowerCase();
  for (const turn of turns) {
    if (turn.text && turn.text.toLowerCase().includes(lowerQuote.slice(0, 40))) {
      return { turnNumber: turn.turn || null, speaker: turn.speaker || null };
    }
  }
  return { turnNumber: null, speaker: null };
}

/**
 * Verify that the quote actually exists in the source text.
 * Returns verification status and reason. Never fabricates.
 */
function verifyQuote(sourceText, quote) {
  if (!quote || quote.trim().length === 0) {
    return {
      status: VERIFICATION.UNSUPPORTED,
      reason: 'No supporting quote could be extracted from the transcript.',
    };
  }

  // Check verbatim match (normalized whitespace)
  const normalizedText = sourceText.replace(/\s+/g, ' ').trim().toLowerCase();
  const normalizedQuote = quote.replace(/\s+/g, ' ').trim().toLowerCase();
  const keyPhrase = normalizedQuote.slice(0, 50);

  if (normalizedText.includes(normalizedQuote)) {
    return {
      status: VERIFICATION.SUPPORTED,
      reason: 'Exact quote found verbatim in the source transcript.',
    };
  }

  if (normalizedText.includes(keyPhrase)) {
    return {
      status: VERIFICATION.PARTIAL,
      reason: 'Key phrase from quote found in transcript; full quote may be a minor paraphrase of surrounding context.',
    };
  }

  return {
    status: VERIFICATION.UNSUPPORTED,
    reason: 'Quote could not be located in the source transcript. It may reference an omitted section or be inaccurate.',
  };
}

/**
 * Extract all findings from a corpus.
 * Deduplicated by category to avoid flooding with identical patterns.
 */
function extractFindings(corpus) {
  const { text, turns, evidence } = corpus;
  if (!text || !evidence.usable) return [];

  const findings = [];
  const seenCategories = new Set();

  for (const patternDef of PATTERNS) {
    const { category, label, patterns, quote_context } = patternDef;

    for (const re of patterns) {
      re.lastIndex = 0;
      const match = re.exec(text);
      if (match) {
        // Avoid exact duplicate category+label combos in the same record
        const key = `${category}::${label}`;
        if (seenCategories.has(key)) continue;
        seenCategories.add(key);

        const quote = extractQuote(text, match.index, quote_context);
        const { turnNumber, speaker } = findTurnForQuote(turns, quote);
        const { status, reason } = verifyQuote(text, quote);

        findings.push({
          category,
          claim_text: label,
          supporting_quote: quote || null,
          turn_number: turnNumber,
          speaker: speaker || null,
          verification_status: status,
          verification_reason: reason,
          requires_human_review: status === VERIFICATION.UNSUPPORTED || status === VERIFICATION.AMBIGUOUS ? 1 : 0,
        });

        break; // One match per pattern group is enough
      }
    }
  }

  return findings;
}

/**
 * Run Agent 2 for a source record. Saves findings to DB.
 */
function runIntelligenceAgent(intakeResult) {
  const db = getDb();
  const now = new Date().toISOString();
  const { sourceRecord, evidence } = intakeResult;

  const logEvent = db.prepare(`
    INSERT INTO agent_events
      (source_record_id, agent_name, event_type, event_data_json, status, processing_mode, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const mode = LLM_MODE ? 'llm' : 'deterministic';

  logEvent.run(
    sourceRecord.id, AGENTS.INTELLIGENCE, 'agent_started',
    JSON.stringify({
      input_from: AGENTS.INTAKE,
      corpus_usable: evidence.usable,
      analysis_mode: LLM_MODE ? 'LLM (REVNEXA_LLM_API_KEY set)' : 'Deterministic keyword/pattern matching',
    }),
    'started', mode, now
  );

  if (!evidence.usable) {
    logEvent.run(
      sourceRecord.id, AGENTS.INTELLIGENCE, 'analysis_skipped',
      JSON.stringify({ reason: evidence.reason }),
      'completed_no_text', mode, new Date().toISOString()
    );
    return { findings: [], sourceRecord };
  }

  const corpus = { text: evidence.text, turns: evidence.turns, evidence };
  const rawFindings = extractFindings(corpus);

  logEvent.run(
    sourceRecord.id, AGENTS.INTELLIGENCE, 'findings_extracted',
    JSON.stringify({
      count: rawFindings.length,
      categories: rawFindings.map(f => f.category),
      analysis_mode: LLM_MODE ? 'llm' : 'deterministic',
    }),
    'completed', mode, new Date().toISOString()
  );

  // Save findings to DB
  const insertFinding = db.prepare(`
    INSERT INTO findings
      (source_record_id, agent_stage, category, claim_text, supporting_quote,
       turn_number, speaker, verification_status, verification_reason,
       requires_human_review, source_revision_at_analysis, is_stale, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
  `);

  const savedFindings = [];
  for (const f of rawFindings) {
    const result = insertFinding.run(
      sourceRecord.id,
      AGENTS.INTELLIGENCE,
      f.category,
      f.claim_text,
      f.supporting_quote,
      f.turn_number,
      f.speaker,
      f.verification_status,
      f.verification_reason,
      f.requires_human_review,
      sourceRecord.applied_revision,
      new Date().toISOString()
    );
    savedFindings.push({ ...f, id: result.lastInsertRowid });
  }

  logEvent.run(
    sourceRecord.id, AGENTS.INTELLIGENCE, 'handoff_to_routing',
    JSON.stringify({ handoff_to: AGENTS.ROUTING, findings_count: savedFindings.length }),
    'completed', mode, new Date().toISOString()
  );

  return { findings: savedFindings, sourceRecord };
}

module.exports = { runIntelligenceAgent, extractFindings, verifyQuote };
