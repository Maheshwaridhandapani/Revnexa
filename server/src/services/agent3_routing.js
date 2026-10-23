'use strict';
/**
 * Agent 3 — Routing & Action
 *
 * Responsibilities:
 *   - Map findings categories to routing destinations
 *   - Produce a clear rationale for each route decision
 *   - Save routing decisions to DB (only if no active human override exists)
 *   - Never overwrite a manager's manual correction
 *
 * Processing mode: deterministic (rule-based routing — no LLM)
 */

const { getDb } = require('../config/database');
const { AGENTS, ROUTES, CATEGORIES, FRESHNESS } = require('../config/constants');

// ─── Routing Rules ────────────────────────────────────────────────────────────

const ROUTING_RULES = [
  {
    category: CATEGORIES.NO_INTEREST,
    route: ROUTES.DO_NOT_CONTACT,
    rationale: 'Contact explicitly stated no interest or said they have existing solutions. Flag for do-not-contact list to prevent repeated outreach.',
    priority: 10,
  },
  {
    category: CATEGORIES.PARTNERSHIP,
    route: ROUTES.PARTNERSHIPS,
    rationale: 'Partnership or referral commission interest was expressed. Route to Partnerships team for structured follow-up.',
    priority: 9,
  },
  {
    category: CATEGORIES.PRICING,
    route: ROUTES.ACCOUNT_EXEC,
    rationale: 'Pricing was discussed. Route to Account Executive to prepare a formal written proposal.',
    priority: 8,
  },
  {
    category: CATEGORIES.OBJECTION,
    route: ROUTES.SALES_DEMO,
    rationale: 'Product objection raised (e.g., prepaid vs credit, pricing discrepancy). Route to Sales/Demo team for clarification call.',
    priority: 7,
  },
  {
    category: CATEGORIES.FOLLOWUP,
    route: ROUTES.FOLLOWUP_CRM,
    rationale: 'A specific follow-up action (call/email) was committed to. Log in CRM follow-up queue to ensure completion.',
    priority: 6,
  },
  {
    category: CATEGORIES.COMMITMENT,
    route: ROUTES.FOLLOWUP_CRM,
    rationale: 'Representative committed to sending information or scheduling a call. Track in CRM to ensure follow-through.',
    priority: 6,
  },
  {
    category: CATEGORIES.COACHING,
    route: ROUTES.COACHING,
    rationale: 'Cold call handling, connection issues, or contact boundary signals identified. Route to Sales Manager for coaching.',
    priority: 5,
  },
  {
    category: CATEGORIES.RISK,
    route: ROUTES.MANAGER_REVIEW,
    rationale: 'Risk indicators (compliance, outstanding invoices, failed onboarding) detected. Requires manager review.',
    priority: 8,
  },
  {
    category: CATEGORIES.CONTACT_INFO,
    route: ROUTES.FOLLOWUP_CRM,
    rationale: 'Contact information was exchanged. Log in CRM for proposal or information delivery.',
    priority: 4,
  },
  {
    category: CATEGORIES.PRODUCT_FEEDBACK,
    route: ROUTES.TECHNICAL,
    rationale: 'Product feedback or technical question raised. Route to Product/Technical team.',
    priority: 5,
  },
];

/**
 * Determine the best route for a source record based on its findings.
 * Uses priority-based rule matching.
 */
function determineRoute(findings, sourceRecord) {
  if (!findings || findings.length === 0) {
    // No usable text → retry queue or no action
    if (!sourceRecord.has_usable_text) {
      return {
        route: ROUTES.RETRY_VOICEMAIL,
        rationale: 'No usable transcript text found. Record may be a voicemail, no-answer, or no-speech event. Queue for retry or manual review.',
        findingId: null,
      };
    }
    return {
      route: ROUTES.NO_ACTION,
      rationale: 'Transcript analyzed but no actionable patterns detected.',
      findingId: null,
    };
  }

  // Match findings to routing rules, pick highest-priority match
  let bestMatch = null;
  let bestPriority = -1;
  let bestFindingId = null;

  for (const finding of findings) {
    for (const rule of ROUTING_RULES) {
      if (finding.category === rule.category && rule.priority > bestPriority) {
        bestPriority = rule.priority;
        bestMatch = rule;
        bestFindingId = finding.id || null;
      }
    }
  }

  if (bestMatch) {
    return {
      route: bestMatch.route,
      rationale: bestMatch.rationale,
      findingId: bestFindingId,
    };
  }

  return {
    route: ROUTES.MANAGER_REVIEW,
    rationale: 'Findings detected but no specific routing rule matched. Escalated to manager for manual review.',
    findingId: null,
  };
}

/**
 * Run Agent 3 for a source record.
 * Saves routing decision only if no active human override exists.
 */
function runRoutingAgent(intelligenceResult) {
  const db = getDb();
  const now = new Date().toISOString();
  const { findings, sourceRecord } = intelligenceResult;

  const logEvent = db.prepare(`
    INSERT INTO agent_events
      (source_record_id, agent_name, event_type, event_data_json, status, processing_mode, created_at)
    VALUES (?, ?, ?, ?, ?, 'deterministic', ?)
  `);

  logEvent.run(
    sourceRecord.id, AGENTS.ROUTING, 'agent_started',
    JSON.stringify({ input_from: AGENTS.INTELLIGENCE, findings_count: findings.length }),
    'started', now
  );

  const { route, rationale, findingId } = determineRoute(findings, sourceRecord);

  logEvent.run(
    sourceRecord.id, AGENTS.ROUTING, 'route_determined',
    JSON.stringify({ ai_suggested_route: route, rationale, based_on_finding_id: findingId }),
    'completed', new Date().toISOString()
  );

  // Check for existing active human override — NEVER overwrite it
  const existingOverride = db.prepare(`
    SELECT id FROM routing_decisions
    WHERE source_record_id = ? AND is_active = 1 AND is_human_override = 1
  `).get(sourceRecord.id);

  if (existingOverride) {
    logEvent.run(
      sourceRecord.id, AGENTS.ROUTING, 'human_override_preserved',
      JSON.stringify({
        message: 'Existing human override detected. AI route stored separately but override is preserved.',
        existing_decision_id: existingOverride.id,
        ai_would_have_routed_to: route,
      }),
      'completed', new Date().toISOString()
    );

    // Save the AI suggestion as a non-active record (for auditing/comparison)
    db.prepare(`
      INSERT INTO routing_decisions
        (source_record_id, finding_id, ai_suggested_route, manager_route,
         route_rationale, is_human_override, review_notes, decision_timestamp,
         is_active, analysis_freshness, source_revision_at_decision)
      VALUES (?, ?, ?, NULL, ?, 0, 'AI re-analysis after source update — human override in place', ?, 0, 'current', ?)
    `).run(sourceRecord.id, findingId, route, rationale, new Date().toISOString(), sourceRecord.applied_revision);

    return { route, rationale, humanOverridePreserved: true, sourceRecord };
  }

  // Check for existing active AI decision — deactivate it first
  db.prepare(`
    UPDATE routing_decisions SET is_active = 0, superseded_at = ?
    WHERE source_record_id = ? AND is_active = 1 AND is_human_override = 0
  `).run(new Date().toISOString(), sourceRecord.id);

  // Insert new active AI routing decision
  db.prepare(`
    INSERT INTO routing_decisions
      (source_record_id, finding_id, ai_suggested_route, manager_route,
       route_rationale, is_human_override, decision_timestamp,
       is_active, analysis_freshness, source_revision_at_decision)
    VALUES (?, ?, ?, NULL, ?, 0, ?, 1, 'current', ?)
  `).run(sourceRecord.id, findingId, route, rationale, new Date().toISOString(), sourceRecord.applied_revision);

  logEvent.run(
    sourceRecord.id, AGENTS.ROUTING, 'routing_decision_saved',
    JSON.stringify({ route, rationale }),
    'completed', new Date().toISOString()
  );

  return { route, rationale, humanOverridePreserved: false, sourceRecord };
}

module.exports = { runRoutingAgent, determineRoute };
