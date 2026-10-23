# Revnexa — Evidence-First Revenue Intelligence Platform

**Tagline:** Turn conversation signals into revenue action.

Revnexa transforms supplied sales-call and meeting records into traceable findings, explainable routing decisions, and useful business outputs.

## Product Identity

- **Product Name:** Revnexa
- **Category:** Revenue Intelligence Platform
- **Positioning:** Evidence-first revenue intelligence for managers

### Four Signature Capabilities

1. **Real-Time AI Meeting Fact Checker** — Validates extracted claims against available source text as soon as a transcript is ingested or an analysis is generated.

2. **Evidence Gate** — Explicit validation layer between AI-generated findings and manager approval. Checks source record existence, evidence quote presence, source version, and analysis freshness.

3. **Agent Handoff Timeline** — Shows actual work performed by three collaborating logical agents: Intake & Evidence, Conversation Intelligence, and Routing & Action.

4. **Decision Memory** — Preserves the relationship between original AI recommendation and manager's final decision. Manual corrections persist across imports and updates.

## Tech Stack

### Backend
- **Framework:** FastAPI (Python)
- **Database:** SQLite with foreign keys
- **AI Mode:** Deterministic by default (pattern extraction + quote fact-checking). Optional LLM via environment variables.
- **Architecture:** Multi-agent system with evidence validation

### Frontend
- **Framework:** React 18 with Vite
- **Styling:** TailwindCSS
- **Icons:** Lucide React
- **Routing:** React Router v6

## Setup Instructions

### Prerequisites
- Python 3.8+
- Node.js 18+
- npm or yarn

### Backend Setup

```bash
cd backend
pip install -r requirements.txt
```

### Environment Configuration

Create a `.env` file in the `backend` directory:

```env
# Required: Secret key for JWT token signing
# Generate using: python -c "import secrets; print(secrets.token_urlsafe(32))"
REVNEXA_SECRET_KEY=your-secret-key-here

# Optional: Token expiration time in minutes (default: 480 = 8 hours)
REVNEXA_TOKEN_EXPIRE_MINUTES=480

# Optional: LLM Configuration (for hybrid AI mode)
# REVNEXA_LLM_API_KEY=
# REVNEXA_LLM_BASE_URL=https://api.openai.com/v1
# REVNEXA_LLM_MODEL=gpt-4o-mini
```

A `.env.example` file is provided as a template.

### Initialize Admin User

Before running the application, create the first administrator account:

```bash
cd backend
python init_admin.py --username admin --email admin@example.com --password yourpassword
```

**Note:** This script can only be run if no users exist in the database. The password must be at least 8 characters.

### Frontend Setup

```bash
cd frontend
npm install
```

### Running the Application

**Terminal 1 — Backend:**
```bash
cd backend
uvicorn app.main:app --reload --port 8000
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm run dev
```

The application will be available at:
- Frontend: http://localhost:5173 (or 5174 if 5173 is in use)
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

### Authentication

**Login:**
- Navigate to http://localhost:5173/login
- Enter the admin credentials created during initialization
- After successful login, you can access all protected routes

**Default Admin Credentials (if not changed):**
- Username: `admin`
- Password: `admin123456`

**Protected Routes:**
All sensitive endpoints require authentication:
- Dashboard (`/dashboard`)
- Records (`/records`, `/records/:id`)
- Fact Checks (`/fact-checks`)
- Agent Timeline (`/agents`)
- Manager Brief (`/brief`)
- Import/Export operations
- Demo Load and Reset (admin only)

**Public Routes:**
- Landing page (`/`)
- Login (`/login`)
- Health check (`/health`)
- Metadata (`/api/meta`)

## Quick Start

### Demo Load (Recommended for Reviewers)

The fastest way to see Revnexa in action:

1. Start both backend and frontend servers
2. Navigate to the Dashboard
3. Click **"Demo Load"** button
4. This will:
   - Reset the database
   - Import initial batch (44 records)
   - Run analysis and routing
   - Import update batch (adds M07 transcript)
   - Re-analyze stale records
   - Result: 44 unique records, 18 usable transcripts

### Manual Import Sequence

To reproduce the assignment replay steps:

1. **Initial Import:** Click "Import Initial" or use API endpoint
2. **Repeat Import:** Import again — should show 0 new records
3. **Manual Correction:** Navigate to any record, edit its route
4. **Update Import:** Import the update batch — M07 gets transcript
5. **Verify:** Manual route should persist, record count stays 44

### Reset

Click **"Reset"** on the Dashboard to clear all data and start fresh.

### Record Detail Actions

Open a record at `/records/{id}` to inspect its transcript, findings, Evidence Gate status, routing decision, agent timeline, and decision history.

- **Run Evidence Gate** calls `POST /api/records/{id}/gate`. The button shows a loading state, prevents repeated requests while running, and displays the returned pass/fail status and validation reasons for each finding. The record is refreshed afterward so findings show the updated Gate status.
- **Re-Analyze** calls `POST /api/records/{id}/analyze`. During analysis the button is disabled and shows a loading indicator. Success refreshes the record so updated findings, evidence quotes, verification status, agent events, and routing suggestions are visible.
- **Manual routing override** is preserved during re-analysis. Re-analysis updates AI suggestions, but the saved manager routes remain current when `is_human_corrected` is true.
- API and network failures are shown in the Record Detail UI instead of being silently ignored.

## Data Structure

### Identity
- **Primary Key:** `(source_type, source_id)` pair
- **Never use:** record_ref, array position, company name, or title as identity

### Import Rules
1. Identity is `(source_type, source_id)`
2. Revision ordering: higher revision replaces lower
3. Same or older revisions are ignored
4. Newer revision replaces entire payload (not a merge)
5. Manual route corrections persist across updates
6. Source text changes mark analysis as stale/pending review

### Source Records
- **Calls:** 30 records (10 with usable transcripts)
- **Meetings:** 14 records (8 with usable transcripts)
- **Total:** 44 unique records after both deliveries
- **Usable Text:** 18 transcripts (17 in initial, 1 in update)

## API Endpoints

### Authentication
- `POST /api/auth/login` — Authenticate user and receive JWT token
- `GET /api/auth/me` — Get current authenticated user info

### Core
- `GET /health` — Health check
- `GET /api/meta` — Product metadata and AI mode disclosure
- `GET /api/dashboard` — Dashboard metrics (requires authentication)
- `GET /api/records` — List records with filters (requires authentication)
- `GET /api/records/{id}` — Record detail with findings, routing, history (requires authentication)

### Import & Pipeline
- `POST /api/import/initial` — Import initial batch (admin only)
- `POST /api/import/update` — Import update batch (admin only)
- `POST /api/demo-load` — One-click demo load (reset + both imports, admin only)
- `POST /api/reset` — Wipe database (admin only)
- `POST /api/replay` — Run automated replay suite (admin only)

### Analysis & Routing
- `POST /api/records/{id}/analyze` — Re-analyze single record (requires authentication)
- `POST /api/analyze-all` — Analyze all records (admin only)
- `POST /api/records/{id}/routes` — Correct routing (manual override, requires authentication)
- `POST /api/records/{id}/review` — Update review status (requires authentication)

### Signature Features
- `GET /api/fact-checks` — List all fact-checked claims (requires authentication)
- `POST /api/fact-checks/{id}/gate` — Run Evidence Gate on finding (requires authentication)
- `POST /api/records/{id}/gate` — Run Evidence Gate on record (requires authentication)
- `GET /api/agents` — Agent handoff timeline (requires authentication)

### Export
- `POST /api/export` — Generate export archive (admin only)
- `GET /api/export/download` — Download latest ZIP (requires authentication)
- `GET /api/export/manifest.json` — Download manifest (requires authentication)

### Brief
- `GET /api/brief` — Manager brief for 2026-08-21 (Asia/Kolkata, requires authentication)

## Routing Categories

- Sales Coaching
- Deal Next Steps
- Customer Follow-up
- Internal/Vendor Notes
- Human Decision Required
- Do Not Contact
- No Action Required

## Verification Statuses

- Supported by transcript
- Partially supported
- Unsupported
- Ambiguous
- Needs human review
- Stale — source changed

## Evidence Gate Statuses

- Verified
- Needs Review
- Invalid Evidence
- Stale

## Export Structure

Exports are organized by source type and record reference:

```
revnexa_export_TIMESTAMP/
├── manifest.json
├── calls/
│   ├── C01/
│   │   ├── Sales_Coaching.md
│   │   ├── Deal_Next_Steps.md
│   │   └── ...
│   ├── C02/
│   └── ...
├── meetings/
│   ├── M01/
│   │   ├── Deal_Next_Steps.md
│   │   └── ...
│   └── ...
└── brief/
    └── manager_brief_2026-08-21.md
```

The manifest includes:
- source_type, source_id
- applied source revision
- route(s)
- output path(s)
- processing/review state
- manual-override flag
- analysis freshness

## Testing

Run the automated test suite:

```bash
cd backend
pytest tests/test_assignment.py -v
```

Tests cover:
- Initial import identity and deduplication
- Duplicate import rejection
- Update handling with late transcript
- Manual route preservation
- Older revision rejection
- Quote validation
- Metrics denominator correctness
- Export manifest paths
- Invalid JSON rejection
- Full replay suite

### Record Detail Browser Check

For a manual workflow check:

1. Start the backend and frontend, then sign in.
2. Open `/records/1` and confirm the record loads.
3. Click **Run Evidence Gate** and verify the Network request is `POST /api/records/1/gate` and the UI displays the returned Gate status and reasons.
4. Click **Re-Analyze** and verify the Network request is `POST /api/records/1/analyze`. Confirm the findings, evidence quotes, analysis status, and routing update after refresh.
5. Save a manual route correction, then run **Re-Analyze** again. Confirm the manager's current routes remain unchanged while AI suggestions can refresh.
6. If either request fails, confirm the UI displays a meaningful API or network error and check the browser console and Network tab for the response.

## AI Usage Disclosure

**Default Mode:** Deterministic

- Conversation Intelligence uses pattern extraction and quote matching
- No LLM is called unless `REVNEXA_LLM_API_KEY` is set
- Fact-checking validates quotes against actual transcript text
- We never invent transcript quotes or fabricate confidence scores

**Optional LLM Mode:** Hybrid

- Set `REVNEXA_LLM_API_KEY` to enable LLM-augmented analysis
- Even with LLM, evidence validation remains deterministic
- All claims must be traceable to source text

## Known Limitations

1. **No Live Meeting Capture** — The assignment provides imported JSON files. Real-time audio capture, streaming transcription, and meeting-platform integrations are outside scope.

2. **No CRM Integration** — No authoritative CRM deal table is supplied. We report conversation-based opportunity signals but cannot verify pipeline values.

3. **Speaker Identity** — No cross-meeting speaker directory. Labels like "Team member A" are local to each meeting.

4. **Account Matching** — Similar titles or names may suggest associations but cannot be confirmed without verified account IDs.

5. **Date Scope** — All activity falls on 2026-08-21 in Asia/Kolkata after date shifting. This is a selected sample, not a representative performance ranking.

## Metric Definitions

### Transcript Coverage
- **Numerator:** Records with usable transcript text (non-blank call transcript or at least one non-blank meeting turn)
- **Denominator:** Total selected source records in the same filter
- **Note:** Coverage can be shown separately by source type

### Connection Rate
- **Numerator:** Calls with `is_connected=true`
- **Denominator:** Calls with non-null `is_connected`
- **Note:** This is a stored upstream classification metric, not a transcript-based assessment

### Routing Counts
- If a record can have multiple routes, route assignments may exceed unique record count
- We show this difference explicitly
- Repeated imports do not inflate counts

## File Structure

```
fintech/
├── backend/
│   ├── app/
│   │   ├── agents/          # Intelligence and routing agents
│   │   ├── api/             # FastAPI endpoints
│   │   ├── services/        # Business logic (import, export, brief, etc.)
│   │   ├── schemas/         # Pydantic models
│   │   ├── config.py        # Configuration
│   │   ├── database.py      # SQLite schema and connection
│   │   └── main.py          # FastAPI app
│   ├── requirements.txt
│   ├── revnexa.db           # SQLite database (created on first run)
│   └── tests/
│       └── test_assignment.py
├── frontend/
│   ├── src/
│   │   ├── pages/           # React page components
│   │   ├── lib/             # Utilities and API client
│   │   ├── App.jsx          # Main app with routing
│   │   ├── main.jsx         # Entry point
│   │   └── index.css        # Tailwind styles
│   ├── package.json
│   ├── vite.config.js
│   └── tailwind.config.js
├── data/
│   ├── 01_initial.json      # Initial delivery (revision 1)
│   ├── 02_update.json       # Update delivery (revision 2)
│   └── README.md
├── exports/                 # Generated export archives
└── README.md                # This file
```

## Assignment Compliance

This implementation addresses all assignment requirements:

1. ✅ **Useful Manager Dashboard** — Activity metrics, transcript coverage, routing counts, review status, filters
2. ✅ **Routing and Analysis** — Evidence-backed findings with traceable quotes, explainable routes, manager corrections
3. ✅ **Manager Brief** — Pre-generated brief for 2026-08-21 with important conversations, coaching, follow-ups
4. ✅ **Export Structure** — Organized folders, machine-readable manifest, all outputs present
5. ✅ **Imports and Updates** — Replay steps work correctly, no duplicates, corrections persist
6. ✅ **Evidence-First** — Every finding cites source evidence, unsupported claims are flagged
7. ✅ **Signature Features** — All four capabilities implemented as functional workflows

## Time Spent

Approximately 8 hours of development time.

## License

This is a paid assignment submission. Do not publish the dataset or assignment materials publicly.
