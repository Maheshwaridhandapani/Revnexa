'use strict';

// Routing destination constants
const ROUTES = {
  DO_NOT_CONTACT: 'do-not-contact',
  PARTNERSHIPS: 'partnerships-team',
  SALES_DEMO: 'sales-demo-team',
  ACCOUNT_EXEC: 'account-executive',
  FOLLOWUP_CRM: 'crm-followup-queue',
  COACHING: 'sales-manager-coaching',
  TECHNICAL: 'product-technical-team',
  RETRY_VOICEMAIL: 'retry-voicemail-queue',
  NO_ACTION: 'no-action-required',
  MANAGER_REVIEW: 'manager-review',
};

// Agent names
const AGENTS = {
  INTAKE: 'Intake & Evidence',
  INTELLIGENCE: 'Conversation Intelligence',
  ROUTING: 'Routing & Action',
};

// Finding categories
const CATEGORIES = {
  OBJECTION: 'objection',
  COMMITMENT: 'commitment',
  RISK: 'risk',
  QUESTION: 'question',
  COACHING: 'coaching-opportunity',
  PARTNERSHIP: 'partnership-interest',
  PRODUCT_FEEDBACK: 'product-feedback',
  PRICING: 'pricing-discussion',
  FOLLOWUP: 'follow-up-required',
  NO_INTEREST: 'no-interest',
  CONTACT_INFO: 'contact-information',
};

// Verification statuses
const VERIFICATION = {
  SUPPORTED: 'Supported by transcript',
  PARTIAL: 'Partially supported',
  UNSUPPORTED: 'Unsupported',
  AMBIGUOUS: 'Ambiguous',
  NEEDS_REVIEW: 'Needs human review',
  STALE: 'Stale — source changed',
};

// Evidence gate statuses
const GATE_STATUS = {
  VERIFIED: 'Verified',
  NEEDS_REVIEW: 'Needs Review',
  INVALID: 'Invalid Evidence',
  STALE: 'Stale',
};

// Analysis freshness statuses
const FRESHNESS = {
  CURRENT: 'current',
  STALE: 'stale',
  PENDING_REVIEW: 'pending-review',
};

module.exports = { ROUTES, AGENTS, CATEGORIES, VERIFICATION, GATE_STATUS, FRESHNESS };
