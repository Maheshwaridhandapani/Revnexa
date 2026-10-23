"""Tests against the real Revnexa assignment JSON files."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from app.agents.intelligence import extract_findings_for_record  # noqa: E402
from app.agents.routing import correct_routes, route_all  # noqa: E402
from app.database import get_connection, init_db  # noqa: E402
from app.services.export_service import generate_export  # noqa: E402
from app.services.import_service import import_initial, import_update  # noqa: E402
from app.services.metrics import dashboard_metrics  # noqa: E402
from app.services.replay import run_replay_suite  # noqa: E402
from app.services.transcript_utils import find_quote_in_transcript  # noqa: E402


@pytest.fixture()
def db(tmp_path: Path):
    path = tmp_path / "test.db"
    init_db(path)
    with get_connection(path) as conn:
        yield conn


def test_initial_import_identity(db):
    result = import_initial(db)
    assert result["inserted"] == 44
    total = db.execute("SELECT COUNT(*) AS c FROM source_records").fetchone()["c"]
    calls = db.execute("SELECT COUNT(*) AS c FROM source_records WHERE source_type='call'").fetchone()["c"]
    meetings = db.execute("SELECT COUNT(*) AS c FROM source_records WHERE source_type='meeting'").fetchone()["c"]
    assert total == 44 and calls == 30 and meetings == 14
    dups = db.execute(
        "SELECT COUNT(*) c FROM (SELECT 1 FROM source_records GROUP BY source_type, source_id HAVING COUNT(*)>1)"
    ).fetchone()["c"]
    assert dups == 0


def test_duplicate_import(db):
    import_initial(db)
    again = import_initial(db, shuffle_order=True)
    total = db.execute("SELECT COUNT(*) AS c FROM source_records").fetchone()["c"]
    assert total == 44
    assert again["inserted"] == 0
    assert again["updated"] == 0
    assert again["unchanged"] == 44


def test_update_late_transcript_and_manual_route(db):
    import_initial(db)
    route_all(db)
    m07 = db.execute("SELECT * FROM source_records WHERE record_ref='M07'").fetchone()
    assert m07["has_usable_text"] == 0
    correct_routes(db, m07["id"], ["Internal/Vendor Notes"], note="keep")
    upd = import_update(db)
    assert upd["updated"] == 1
    m07b = db.execute("SELECT * FROM source_records WHERE record_ref='M07'").fetchone()
    assert m07b["id"] == m07["id"]
    assert m07b["applied_revision"] == 2
    assert m07b["has_usable_text"] == 1
    total = db.execute("SELECT COUNT(*) AS c FROM source_records").fetchone()["c"]
    assert total == 44
    rd = db.execute("SELECT * FROM routing_decisions WHERE source_record_id=?", (m07["id"],)).fetchone()
    assert rd["is_human_corrected"] == 1
    assert "Internal/Vendor Notes" in json.loads(rd["current_routes_json"])
    assert rd["analysis_freshness"] in {"pending-review", "stale"}


def test_older_revision_ignored(db):
    import_initial(db)
    import_update(db)
    again = import_initial(db)
    assert again["updated"] == 0
    m07 = db.execute("SELECT * FROM source_records WHERE record_ref='M07'").fetchone()
    assert m07["applied_revision"] == 2
    assert m07["has_usable_text"] == 1


def test_missing_transcript_no_findings(db):
    import_initial(db)
    silent = db.execute("SELECT * FROM source_records WHERE has_usable_text = 0").fetchall()
    assert silent
    for row in silent:
        assert extract_findings_for_record(row) == []


def test_quote_validation():
    from app.config import INITIAL_FILE

    delivery = json.loads(INITIAL_FILE.read_text(encoding="utf-8"))
    c01 = next(r for r in delivery["records"] if r["record_ref"] == "C01")
    loc = find_quote_in_transcript("I'm not interested", "call", c01["payload"], None)
    assert loc["found"] is True
    fake = find_quote_in_transcript("pipeline closed won $4m", "call", c01["payload"], None)
    assert fake["found"] is False


def test_metrics_denominator(db):
    import_initial(db)
    m = dashboard_metrics(db)
    assert m["transcript_coverage"]["denominator"] == 44
    assert m["transcript_coverage"]["numerator"] == m["usable_transcript_text"]
    assert m["calls"] == 30
    assert m["meetings"] == 14


def test_export_manifest_paths(db, monkeypatch, tmp_path):
    import app.services.export_service as es

    monkeypatch.setattr(es, "EXPORTS_DIR", tmp_path / "exports")
    import_initial(db)
    route_all(db)
    result = generate_export(db)
    assert result["ok"] is True
    assert Path(result["zip_path"]).exists()


def test_invalid_json_rejected(tmp_path):
    from app.services.import_service import load_delivery

    p = tmp_path / "bad.json"
    p.write_text('{"nope": true}', encoding="utf-8")
    with pytest.raises(ValueError):
        load_delivery(p)


def test_replay_suite():
    report = run_replay_suite()
    failed = [r for r in report["results"] if not r["pass"]]
    assert report["failed"] == 0, failed
