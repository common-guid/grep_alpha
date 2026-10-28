"""Screens drop-folder ingester: valid, invalid, duplicate, changed content, temp files, read-only."""
import copy
import json
import os
import stat
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from grep_alpha.src import screens_drop as sd  # noqa: E402
from grep_alpha.src import screens as sc  # noqa: E402

GOOD = {
    "screen": "lr10", "version": 1, "run_at": "2026-10-15T21:05:00Z", "as_of": "2026-10-15",
    "columns": [{"key": "r2", "label": "R²", "fmt": "f2"}],
    "rows": [{"ticker": "FIGS", "rank": 1, "r2": 0.94}, {"ticker": "NVDA", "rank": 2, "r2": 0.5}],
}


@pytest.fixture
def env(tmp_path, monkeypatch):
    from grep_alpha.src import database
    monkeypatch.setattr(database, "DB_PATH", str(tmp_path / "t.db"))
    database.init_db()
    d = tmp_path / "drop"
    d.mkdir()
    return d, database.get_connection


def write(d, name, obj):
    p = d / name
    p.write_text(obj if isinstance(obj, str) else json.dumps(obj))
    return p


def snapshot(d):
    return {p.name: (p.read_bytes() if p.is_file() else None, p.stat().st_mtime_ns) for p in sorted(d.iterdir())}


def test_valid_file_ingested_once(env):
    d, db = env
    write(d, "lr10_20261015T210500Z.json", GOOD)
    r = sd.scan_once(str(d), db)
    assert r["ingested"] == ["lr10_20261015T210500Z.json"]
    run = sc.get_run(db, "lr10")
    assert run["row_count"] == 2 and run["as_of"] == "2026-10-15"
    r2 = sd.scan_once(str(d), db)
    assert r2 == {"ingested": [], "rejected": [], "skipped": ["lr10_20261015T210500Z.json"]}
    with db() as c:
        assert c.execute("SELECT COUNT(*) FROM screen_runs").fetchone()[0] == 1
    rec = sd.recent(db)[0]
    assert rec["status"] == "ingested" and rec["screen"] == "lr10" and rec["run_id"] == run["id"]
    assert rec["row_count"] == 2 and len(rec["sha256"]) == 64


def test_invalid_rejected_with_errors_and_not_retried(env, caplog):
    d, db = env
    bad = copy.deepcopy(GOOD); bad["rows"][0]["ticker"] = "B@D"
    write(d, "lr10_bad.json", bad)
    write(d, "broken.json", "{not json")
    r = sd.scan_once(str(d), db)
    assert sorted(r["rejected"]) == ["broken.json", "lr10_bad.json"]
    recs = {x["filename"]: x for x in sd.recent(db)}
    assert "ticker invalid" in recs["lr10_bad.json"]["errors"][0] and recs["lr10_bad.json"]["screen"] == "lr10"
    assert recs["broken.json"]["errors"] == ["not valid UTF-8 JSON"]
    assert "rejected lr10_bad.json" in caplog.text
    assert sd.scan_once(str(d), db)["rejected"] == []  # not retried while unchanged
    assert sc.get_run(db, "lr10") is None


def test_changed_content_is_reprocessed(env):
    d, db = env
    bad = copy.deepcopy(GOOD); bad["version"] = 2
    write(d, "lr10_x.json", bad)
    assert sd.scan_once(str(d), db)["rejected"] == ["lr10_x.json"]
    write(d, "lr10_x.json", GOOD)  # producer fixed and re-wrote the file
    assert sd.scan_once(str(d), db)["ingested"] == ["lr10_x.json"]
    newer = copy.deepcopy(GOOD); newer["rows"] = newer["rows"][:1]
    write(d, "lr10_x.json", newer)  # same run_at, new content -> replaces the run
    assert sd.scan_once(str(d), db)["ingested"] == ["lr10_x.json"]
    assert sc.get_run(db, "lr10")["row_count"] == 1
    with db() as c:
        assert c.execute("SELECT COUNT(*) FROM screen_runs").fetchone()[0] == 1
        assert c.execute("SELECT COUNT(*) FROM screen_ingests").fetchone()[0] == 3


def test_duplicate_payload_under_two_names(env):
    d, db = env
    write(d, "a.json", GOOD)
    write(d, "b.json", GOOD)
    r = sd.scan_once(str(d), db)
    assert r["ingested"] == ["a.json", "b.json"]
    run = sc.get_run(db, "lr10")
    with db() as c:
        assert c.execute("SELECT COUNT(*) FROM screen_runs").fetchone()[0] == 1, "same screen+run_at -> one run"
    assert [x["replaced"] for x in sd.recent(db)] == [True, False]
    assert run["row_count"] == 2


@pytest.mark.parametrize("name", [
    ".syncthing.lr10_1.json.tmp", "~syncthing~lr10_1.json.tmp", ".lr10_1.json", "~lr10.json",
    "lr10_1.json.tmp", "lr10_1.json.part", "notes.txt", "lr10_1.JSON.partial",
])
def test_temp_and_non_json_files_ignored(env, name):
    d, db = env
    write(d, name, GOOD)
    assert sd.scan_once(str(d), db) == {"ingested": [], "rejected": [], "skipped": []}
    assert sd.recent(db) == []


def test_never_modifies_drop_dir_even_read_only(env):
    d, db = env
    write(d, "lr10_ok.json", GOOD)
    write(d, "bad.json", "{")
    (d / "sub").mkdir()
    before = snapshot(d)
    os.chmod(d, stat.S_IRUSR | stat.S_IXUSR)  # read-only dir, like the :ro mount
    try:
        r = sd.scan_once(str(d), db)
    finally:
        os.chmod(d, stat.S_IRWXU)
    assert r["ingested"] == ["lr10_ok.json"] and r["rejected"] == ["bad.json"]
    assert snapshot(d) == before


def test_too_large_rejected(env, monkeypatch):
    d, db = env
    monkeypatch.setattr(sc, "MAX_BODY_BYTES", 10)
    write(d, "big.json", GOOD)
    assert sd.scan_once(str(d), db)["rejected"] == ["big.json"]
    assert "bytes" in sd.recent(db)[0]["errors"][0]


def test_missing_dir_is_harmless(env):
    _, db = env
    w = sd.DropWatcher("/nonexistent/screens", db)
    assert w.scan() == {"ingested": [], "rejected": [], "skipped": []}
    assert w.last_error == "drop dir not found"
    assert not sd.DropWatcher(None, db).enabled


def test_ingest_status_endpoint(env, monkeypatch):
    from fastapi.testclient import TestClient
    import backend.main as m
    d, db = env
    write(d, "lr10_a.json", GOOD)
    write(d, "zz_bad.json", {"screen": "x"})
    w = sd.DropWatcher(str(d), db)
    monkeypatch.setattr(m, "screens_drop", w)
    w.scan()
    r = TestClient(m.app).get("/api/screens/ingest-status").json()
    assert r["enabled"] and r["dir_exists"] and r["last_scan_at"]
    assert [(x["filename"], x["status"]) for x in r["recent"]] == [("zz_bad.json", "rejected"), ("lr10_a.json", "ingested")]
    assert TestClient(m.app).get("/api/screens/lr10/latest").json()["row_count"] == 2
