"""Revnexa FastAPI application."""
from __future__ import annotations

import json
from datetime import timedelta
from pathlib import Path
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from .auth import create_access_token, decode_access_token
from .config import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    AI_MODE,
    ALGORITHM,
    BRIEF_DATE,
    BRIEF_TZ,
    EXPORTS_DIR,
    LLM_MODEL,
    ROUTES,
)
from .database import get_connection, init_db
from .agents.intelligence import analyze_all, analyze_record
from .agents.routing import correct_routes, route_all, route_record
from .schemas import (
    AssistantQuery,
    LoginRequest,
    ReviewAction,
    RouteCorrection,
    TokenResponse,
    UserResponse,
)
from .services.assistant import ask
from .services.brief import build_manager_brief
from .services.evidence_gate import validate_finding, validate_record
from .services.export_service import generate_export
from .services.import_service import import_initial, import_update
from .services.metrics import dashboard_metrics
from .services.pipeline import demo_load, reset_database
from .services.replay import run_replay_suite
from .services.transcript_utils import extract_usable_text, meeting_turns
from .services.user_service import authenticate_user, get_user_by_id

init_db()

app = FastAPI(
    title="Revnexa API",
    description=(
        "Evidence-first revenue intelligence. Identity is (source_type, source_id). "
        f"Analysis mode: {AI_MODE}. Live meeting capture is out of scope."
    ),
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:5174", "http://127.0.0.1:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Security
security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> dict:
    """Dependency to get the current authenticated user."""
    token = credentials.credentials
    payload = decode_access_token(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
        )
    
    user = get_user_by_id(user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    
    if not user["is_active"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive",
        )
    
    return user


async def get_current_admin(
    current_user: dict = Depends(get_current_user)
) -> dict:
    """Dependency to get the current authenticated admin user."""
    if current_user["role"] != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    return current_user


def _row(r) -> dict:
    return dict(r) if r is not None else None


def _hydrate(r) -> dict:
    d = dict(r)
    d["payload"] = json.loads(d.pop("payload_json"))
    tp = d.pop("transcript_payload_json")
    d["transcript_payload"] = json.loads(tp) if tp else None
    d["has_usable_text"] = bool(d["has_usable_text"])
    return d


@app.get("/health")
def health():
    return {"product": "Revnexa", "status": "ok", "ai_mode": AI_MODE, "llm_model": LLM_MODEL if AI_MODE != "deterministic" else None}


@app.get("/api/meta")
def meta():
    return {
        "product": "Revnexa",
        "tagline": "Turn conversation signals into revenue action.",
        "ai_mode": AI_MODE,
        "llm_used": AI_MODE != "deterministic",
        "live_audio": False,
        "brief_date": BRIEF_DATE,
        "brief_timezone": BRIEF_TZ,
        "routes": ROUTES,
        "disclosure": (
            "Conversation Intelligence and fact-checking are deterministic quote/pattern checks. "
            "No LLM is called unless REVNEXA_LLM_API_KEY is set. "
            "Verification runs when transcripts are imported or analyzed — not as a live meeting listener."
        ),
    }


# Authentication Endpoints
@app.post("/api/auth/login", response_model=TokenResponse)
def login(body: LoginRequest):
    """Authenticate user and return access token."""
    user = authenticate_user(body.username, body.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token = create_access_token(
        data={"sub": str(user["id"]), "username": user["username"], "role": user["role"]},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    
    return TokenResponse(
        access_token=access_token,
        user=UserResponse(**user)
    )


@app.get("/api/auth/me", response_model=UserResponse)
def get_me(current_user: dict = Depends(get_current_user)):
    """Get current authenticated user."""
    return UserResponse(**current_user)


@app.get("/api/dashboard")
def dashboard(source_type: str | None = None, person: str | None = None, current_user: dict = Depends(get_current_user)):
    with get_connection() as conn:
        return dashboard_metrics(conn, source_type=source_type, person=person)


@app.get("/api/records")
def list_records(
    q: str | None = None,
    source_type: str | None = None,
    person: str | None = None,
    transcript: str | None = Query(None, description="usable|missing"),
    review_status: str | None = None,
    route: str | None = None,
    evidence_gate: str | None = None,
    analysis_status: str | None = None,
    current_user: dict = Depends(get_current_user),
):
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM source_records ORDER BY activity_at DESC, id").fetchall()
        out = []
        for r in rows:
            if source_type and r["source_type"] != source_type:
                continue
            if person and r["person_label"] != person:
                continue
            if transcript == "usable" and not r["has_usable_text"]:
                continue
            if transcript == "missing" and r["has_usable_text"]:
                continue
            rd = conn.execute(
                "SELECT * FROM routing_decisions WHERE source_record_id = ?",
                (r["id"],),
            ).fetchone()
            if review_status and (not rd or rd["review_status"] != review_status):
                continue
            if route and rd:
                routes = json.loads(rd["current_routes_json"] or "[]")
                if route not in routes:
                    continue
            elif route and not rd:
                continue
            analysis = conn.execute(
                """
                SELECT processing_status, analysis_freshness FROM analysis_results
                WHERE source_record_id = ? ORDER BY id DESC LIMIT 1
                """,
                (r["id"],),
            ).fetchone()
            if analysis_status == "stale" and (not analysis or analysis["analysis_freshness"] != "stale"):
                continue
            gate_row = conn.execute(
                """
                SELECT evidence_gate_status FROM findings
                WHERE source_record_id = ? AND is_stale = 0
                ORDER BY id DESC LIMIT 1
                """,
                (r["id"],),
            ).fetchone()
            if evidence_gate and (not gate_row or gate_row["evidence_gate_status"] != evidence_gate):
                continue
            blob = f"{r['record_ref']} {r['source_id']} {r['title']} {r['person_label']}"
            if q and q.lower() not in blob.lower():
                continue
            item = {
                "id": r["id"],
                "source_type": r["source_type"],
                "source_id": r["source_id"],
                "record_ref": r["record_ref"],
                "title": r["title"],
                "person_label": r["person_label"],
                "activity_at": r["activity_at"],
                "has_usable_text": bool(r["has_usable_text"]),
                "applied_revision": r["applied_revision"],
                "content_hash": r["content_hash"],
                "routes": json.loads(rd["current_routes_json"]) if rd else [],
                "ai_routes": json.loads(rd["ai_suggested_routes_json"]) if rd else [],
                "is_human_corrected": bool(rd["is_human_corrected"]) if rd else False,
                "review_status": rd["review_status"] if rd else "pending",
                "analysis_freshness": (rd["analysis_freshness"] if rd else (analysis["analysis_freshness"] if analysis else "n/a")),
                "evidence_gate_status": gate_row["evidence_gate_status"] if gate_row else None,
            }
            out.append(item)
        return {"count": len(out), "records": out}


@app.get("/api/records/{record_id}")
def get_record(record_id: int, current_user: dict = Depends(get_current_user)):
    with get_connection() as conn:
        r = conn.execute("SELECT * FROM source_records WHERE id = ?", (record_id,)).fetchone()
        if not r:
            raise HTTPException(404, "Record not found")
        data = _hydrate(r)
        data["turns"] = []
        if data["source_type"] == "meeting":
            for i, t in enumerate(meeting_turns(data["transcript_payload"]), start=1):
                data["turns"].append({"turn_number": i, **t})
        data["usable_text"] = extract_usable_text(
            data["source_type"], data["payload"], data["transcript_payload"]
        )
        data["findings"] = [
            dict(f)
            for f in conn.execute(
                "SELECT * FROM findings WHERE source_record_id = ? ORDER BY is_stale, id",
                (record_id,),
            ).fetchall()
        ]
        rd = conn.execute(
            "SELECT * FROM routing_decisions WHERE source_record_id = ?",
            (record_id,),
        ).fetchone()
        data["routing"] = dict(rd) if rd else None
        if data["routing"]:
            data["routing"]["current_routes"] = json.loads(data["routing"]["current_routes_json"])
            data["routing"]["ai_suggested_routes"] = json.loads(data["routing"]["ai_suggested_routes_json"])
            data["routing"]["route_reasons"] = json.loads(data["routing"]["route_reasons_json"] or "[]")
        data["history"] = [
            dict(h)
            for h in conn.execute(
                "SELECT * FROM decision_history WHERE source_record_id = ? ORDER BY id DESC",
                (record_id,),
            ).fetchall()
        ]
        data["agent_events"] = [
            dict(e)
            for e in conn.execute(
                "SELECT * FROM agent_events WHERE source_record_id = ? ORDER BY id",
                (record_id,),
            ).fetchall()
        ]
        data["audit"] = [
            dict(a)
            for a in conn.execute(
                "SELECT * FROM audit_events WHERE source_record_id = ? ORDER BY id DESC LIMIT 30",
                (record_id,),
            ).fetchall()
        ]
        return data


@app.get("/api/fact-checks")
def fact_checks(status: str | None = None, current_user: dict = Depends(get_current_user)):
    with get_connection() as conn:
        sql = """
            SELECT f.*, s.record_ref, s.source_type, s.source_id, s.title
            FROM findings f JOIN source_records s ON s.id = f.source_record_id
            WHERE 1=1
        """
        params: list[Any] = []
        if status:
            sql += " AND f.verification_status = ?"
            params.append(status)
        sql += " ORDER BY f.is_stale, f.id DESC"
        rows = [dict(r) for r in conn.execute(sql, params).fetchall()]
        return {"count": len(rows), "claims": rows, "ai_mode": AI_MODE}


@app.post("/api/fact-checks/{finding_id}/gate")
def run_gate(finding_id: int, current_user: dict = Depends(get_current_user)):
    with get_connection() as conn:
        return validate_finding(conn, finding_id)


@app.post("/api/records/{record_id}/gate")
def run_record_gate(record_id: int, current_user: dict = Depends(get_current_user)):
    with get_connection() as conn:
        return {"results": validate_record(conn, record_id)}


@app.get("/api/agents")
def agents(source_record_id: int | None = None, current_user: dict = Depends(get_current_user)):
    with get_connection() as conn:
        if source_record_id:
            rows = conn.execute(
                "SELECT * FROM agent_events WHERE source_record_id = ? ORDER BY id",
                (source_record_id,),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM agent_events ORDER BY id DESC LIMIT 200"
            ).fetchall()
        return {
            "events": [dict(r) for r in rows],
            "agents": [
                {
                    "name": "Intake & Evidence",
                    "mode": "deterministic",
                    "role": "Identity, hashing, usable-text detection, revision rules",
                },
                {
                    "name": "Conversation Intelligence",
                    "mode": AI_MODE,
                    "role": "Pattern extraction + quote fact-check (not a live LLM unless configured)",
                },
                {
                    "name": "Routing & Action",
                    "mode": "deterministic",
                    "role": "Multi-route suggestions with Decision Memory",
                },
            ],
        }


@app.post("/api/records/{record_id}/analyze")
def analyze_one(record_id: int, current_user: dict = Depends(get_current_user)):
    with get_connection() as conn:
        result = analyze_record(conn, record_id, force=True)
        route_record(conn, record_id)
        return result


@app.post("/api/analyze-all")
def analyze_everything(current_user: dict = Depends(get_current_admin)):
    with get_connection() as conn:
        a = analyze_all(conn, only_missing=False)
        route_all(conn)
        return a


@app.post("/api/records/{record_id}/routes")
def patch_routes(record_id: int, body: RouteCorrection, current_user: dict = Depends(get_current_user)):
    with get_connection() as conn:
        try:
            return correct_routes(conn, record_id, body.routes, note=body.note, review_status=body.review_status)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc


@app.post("/api/records/{record_id}/review")
def review(record_id: int, body: ReviewAction, current_user: dict = Depends(get_current_user)):
    allowed = {"approved", "rejected", "reopened", "needs_review"}
    if body.action not in allowed:
        raise HTTPException(400, f"action must be one of {sorted(allowed)}")
    with get_connection() as conn:
        exists = conn.execute("SELECT id FROM routing_decisions WHERE source_record_id = ?", (record_id,)).fetchone()
        if not exists:
            raise HTTPException(404, "No routing decision")
        from datetime import datetime, timezone

        now = datetime.now(timezone.utc).isoformat()
        conn.execute(
            """
            UPDATE routing_decisions
            SET review_status = ?, review_note = COALESCE(?, review_note), updated_at = ?
            WHERE source_record_id = ?
            """,
            (body.action if body.action != "reopened" else "reopened", body.note, now, record_id),
        )
        conn.execute(
            """
            INSERT INTO audit_events (source_record_id, event_type, previous_value, new_value, actor, created_at)
            VALUES (?, 'review_status', NULL, ?, 'manager', ?)
            """,
            (record_id, body.action, now),
        )
        return {"ok": True, "review_status": body.action}


@app.get("/api/brief")
def brief(current_user: dict = Depends(get_current_user)):
    with get_connection() as conn:
        return build_manager_brief(conn)


@app.post("/api/import/initial")
def api_import_initial(shuffle_order: bool = False, current_user: dict = Depends(get_current_admin)):
    with get_connection() as conn:
        result = import_initial(conn, shuffle_order=shuffle_order)
        analyze_all(conn, only_missing=True)
        route_all(conn)
        return result


@app.post("/api/import/update")
def api_import_update(current_user: dict = Depends(get_current_admin)):
    with get_connection() as conn:
        result = import_update(conn)
        analyze_all(conn, only_missing=True)
        route_all(conn)
        return result


@app.get("/api/import/batches")
def batches(current_user: dict = Depends(get_current_user)):
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM import_batches ORDER BY id DESC").fetchall()
        return {"batches": [dict(r) for r in rows]}


@app.post("/api/demo-load")
def api_demo_load(current_user: dict = Depends(get_current_admin)):
    return demo_load()


@app.post("/api/reset")
def api_reset(current_user: dict = Depends(get_current_admin)):
    reset_database()
    return {"ok": True, "message": "Database wiped. Use Import initial or Demo load."}


@app.post("/api/replay")
def api_replay(current_user: dict = Depends(get_current_admin)):
    report = run_replay_suite()
    with get_connection() as conn:
        from datetime import datetime, timezone

        conn.execute(
            "INSERT INTO replay_reports (report_json, created_at) VALUES (?, ?)",
            (json.dumps(report), datetime.now(timezone.utc).isoformat()),
        )
    return report


@app.get("/api/audit")
def audit(limit: int = 100, current_user: dict = Depends(get_current_user)):
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM audit_events ORDER BY id DESC LIMIT ?",
            (limit,),
        ).fetchall()
        return {"events": [dict(r) for r in rows]}


@app.post("/api/export")
def api_export(current_user: dict = Depends(get_current_admin)):
    with get_connection() as conn:
        result = generate_export(conn)
    return result


@app.get("/api/export/download")
def download_latest(current_user: dict = Depends(get_current_user)):
    zips = sorted(EXPORTS_DIR.glob("revnexa_export_*.zip"))
    if not zips:
        raise HTTPException(404, "No export generated yet")
    latest = zips[-1]
    return FileResponse(latest, filename=latest.name, media_type="application/zip")


@app.get("/api/export/manifest.json")
def download_manifest(current_user: dict = Depends(get_current_user)):
    dirs = sorted(EXPORTS_DIR.glob("revnexa_export_*"))
    dirs = [d for d in dirs if d.is_dir()]
    if not dirs:
        raise HTTPException(404, "No export directory")
    path = dirs[-1] / "manifest.json"
    if not path.exists():
        raise HTTPException(404, "manifest.json missing")
    return FileResponse(path, filename="manifest.json", media_type="application/json")


@app.post("/api/assistant")
def assistant(body: AssistantQuery, current_user: dict = Depends(get_current_user)):
    with get_connection() as conn:
        if body.confirm_route_change and body.source_record_id and body.routes:
            result = correct_routes(conn, body.source_record_id, body.routes, note="assistant-confirmed")
            return {"changed": True, "result": result}
        return ask(conn, body.question)
