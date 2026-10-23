"""Orchestrate import → analyze → route for demo load / reset."""
from __future__ import annotations

from pathlib import Path

from ..config import DB_PATH
from ..database import get_connection, init_db
from ..agents.intelligence import analyze_all
from ..agents.routing import route_all
from .import_service import import_initial, import_update


def reset_database(db_path: Path | None = None) -> None:
    path = Path(db_path or DB_PATH)
    if path.exists():
        path.unlink()
    init_db(path)


def demo_load(db_path: Path | None = None) -> dict:
    """Clean start: initial → analyze/route → update → reanalyze stale → route."""
    reset_database(db_path)
    with get_connection(db_path) as conn:
        r1 = import_initial(conn)
        a1 = analyze_all(conn, only_missing=False)
        route_all(conn)
        r2 = import_update(conn)
        a2 = analyze_all(conn, only_missing=True)
        route_all(conn)
        total = conn.execute("SELECT COUNT(*) AS c FROM source_records").fetchone()["c"]
        usable = conn.execute(
            "SELECT COUNT(*) AS c FROM source_records WHERE has_usable_text = 1"
        ).fetchone()["c"]
    return {
        "initial_import": r1,
        "update_import": r2,
        "analyzed_passes": [a1, a2],
        "unique_records": total,
        "usable_transcripts": usable,
    }
