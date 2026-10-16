"""Screens: JSON v1 validation, storage, pruning, API, converter. Uses a temp DB."""
import copy
import json
import os
import sqlite3
import subprocess
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from grep_alpha.src import screens as sc  # noqa: E402

BASE = {
    "screen": "lr10", "version": 1, "run_at": "2026-10-15T21:05:00Z", "as_of": "2026-10-15",
    "params": {"window": 10}, "universe": {"count": 292}, "source": "test",
    "columns": [{"key": "slope_pct_per_day", "label": "Slope %/d", "fmt": "pct2"}, {"key": "r2", "label": "R²", "fmt": "f2"}],
    "rows": [
        {"ticker": "FIGS", "rank": 1, "slope_pct_per_day": 4.566, "r2": 0.94, "window_end": "2026-10-15"},
        {"ticker": "nvda", "rank": 2, "slope_pct_per_day": 1.2, "r2": None},
    ],
}


def P(**kw):
    p = copy.deepcopy(BASE)
    p.update(kw)
    return p


@pytest.fixture
def db(tmp_path, monkeypatch):
    from grep_alpha.src import database
    path = str(tmp_path / "t.db")
    monkeypatch.setattr(database, "DB_PATH", path)
    database.init_db()
    return database.get_connection


def test_validate_normalizes():
    out = sc.validate_payload(P(run_at="2026-10-15T17:05:00-04:00"))
    assert out["run_at"] == "2026-10-15T21:05:00Z"
    assert [r["ticker"] for r in out["rows"]] == ["FIGS", "NVDA"]
    assert out["rows"][1]["r2"] is None and out["rows"][0]["window_end"] == "2026-10-15"


@pytest.mark.parametrize("mut,frag", [
    (dict(version=2), "version"),
    (dict(screen="LR 10"), "screen"),
    (dict(run_at="2026-10-15 21:05"), "run_at"),
    (dict(as_of="2026-13-01"), "as_of"),
    (dict(columns=[]), "columns"),
    (dict(columns=[{"key": "rank", "label": "x"}]), "key invalid"),
    (dict(columns=[{"key": "a", "fmt": "weird"}]), "fmt"),
    (dict(rows=[{"ticker": "BAD$", "rank": 1}]), "ticker invalid"),
    (dict(rows=[{"ticker": "", "rank": 1}]), "ticker invalid"),
    (dict(rows=[{"ticker": "AAA", "rank": 1}, {"ticker": "aaa", "rank": 2}]), "duplicate"),
    (dict(rows=[{"ticker": "AAA", "rank": 1}, {"ticker": "BBB", "rank": 1}]), "rank duplicate"),
    (dict(rows=[{"ticker": "AAA"}]), "rank"),
    (dict(rows=[{"ticker": "AAA", "rank": 1, "r2": "high"}]), "finite number"),
    (dict(rows=[{"ticker": "AAA", "rank": 1, "r2": float("nan")}]), "finite number"),
    (dict(rows=[{"ticker": f"T{i}", "rank": i + 1} for i in range(1001)]), "1000"),
])
def test_validate_rejects(mut, frag):
    with pytest.raises(sc.ScreenValidationError) as e:
        sc.validate_payload(P(**mut))
    assert frag in str(e.value)


def test_validate_accepts_1000_rows_and_empty():
    sc.validate_payload(P(rows=[{"ticker": f"T{i}", "rank": i + 1} for i in range(1000)]))
    assert sc.validate_payload(P(rows=[]))["rows"] == []


def test_store_list_get_replace_and_prune(db):
    for d in range(32):
        sc.store_run(db, sc.validate_payload(P(run_at=f"2026-09-{(d % 30) + 1:02d}T21:00:00Z" if d < 30 else f"2026-10-{d - 28:02d}T21:00:00Z")))
    with db() as c:
        assert c.execute("SELECT COUNT(*) FROM screen_runs WHERE name='lr10'").fetchone()[0] == 30
        oldest = c.execute("SELECT MIN(run_at) FROM screen_runs").fetchone()[0]
    assert oldest == "2026-09-03T21:00:00Z", "two oldest pruned"
    sc.store_run(db, sc.validate_payload(P(screen="rsi10")))
    rid, replaced, _ = sc.store_run(db, sc.validate_payload(P(screen="rsi10", rows=[{"ticker": "AAA", "rank": 1}])))
    assert replaced
    ls = sc.list_screens(db)
    assert [s["screen"] for s in ls] == ["lr10", "rsi10"]
    assert ls[0]["runs"] == 30 and ls[0]["latest"]["run_at"] == "2026-10-03T21:00:00Z"
    assert ls[1]["runs"] == 1 and ls[1]["latest"]["row_count"] == 1
    run = sc.get_run(db, "rsi10")
    assert run["id"] == rid and run["rows"] == [{"ticker": "AAA", "rank": 1}]
    assert sc.get_run(db, "nope") is None and sc.get_run(db, "lr10", 999999) is None


@pytest.fixture
def client(db, monkeypatch):
    from fastapi.testclient import TestClient
    import backend.main as m
    monkeypatch.setattr(m, "get_flipcharts_watchlist_items", lambda: [{"symbol": "NVDA"}])
    return TestClient(m.app)


def test_api_roundtrip(client, db):
    assert client.get("/api/screens").json() == {"screens": []}
    r = client.post("/api/screens", json=P())
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["row_count"] == 2 and body["off_watchlist"] == ["FIGS"] and body["replaced"] is False
    assert client.post("/api/screens", json=P()).status_code == 200  # same run_at -> replaced
    latest = client.get("/api/screens/lr10/latest").json()
    assert {r["ticker"]: r["on_watchlist"] for r in latest["rows"]} == {"FIGS": False, "NVDA": True}
    assert latest["columns"][0]["key"] == "slope_pct_per_day"
    assert client.get(f"/api/screens/lr10/{body['id']}").json()["id"] == body["id"]
    assert client.get("/api/screens/lr10/runs").json()["runs"][0]["id"] == body["id"]
    assert client.get("/api/screens/nope/latest").status_code == 404
    bad = client.post("/api/screens", json=P(rows=[{"ticker": "B@D", "rank": 1}]))
    assert bad.status_code == 422 and "ticker" in bad.json()["errors"][0]
    assert client.post("/api/screens", content=b"{not json", headers={"Content-Type": "application/json"}).status_code == 400


def test_gets_are_side_effect_free(client, db):
    client.post("/api/screens", json=P())
    with db() as c:
        before = c.execute("SELECT id, created_at, rows_json FROM screen_runs").fetchall()
    for u in ("/api/screens", "/api/screens/lr10/latest", "/api/screens/lr10/runs"):
        assert client.get(u).status_code == 200
    with db() as c:
        assert c.execute("SELECT id, created_at, rows_json FROM screen_runs").fetchall() == before


def test_get_without_table_returns_empty(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient
    import backend.main as m
    from grep_alpha.src import database
    monkeypatch.setattr(database, "DB_PATH", str(tmp_path / "empty.db"))
    c = TestClient(m.app)
    assert c.get("/api/screens").json() == {"screens": []}
    assert c.get("/api/screens/x/latest").status_code == 404
    with sqlite3.connect(str(tmp_path / "empty.db")) as conn:
        assert conn.execute("SELECT name FROM sqlite_master WHERE name='screen_runs'").fetchone() is None


def test_converter_on_trader_csv(tmp_path):
    csvp = tmp_path / "lr.csv"
    csvp.write_text("ticker,slope_pct_per_day,slope_usd_per_day,r2,window_start,window_end,last_close\n"
                    "FIGS,4.566,0.73,0.94,2026-10-02,2026-10-15,19.54\nmrna,2.329,4.871,0.77,2026-10-02,2026-10-15,236.5\n")
    out = subprocess.run([sys.executable, os.path.join(ROOT, "tools", "screen_csv_to_v1.py"), str(csvp), "--screen", "lr10",
                          "--column", "slope_pct_per_day:Slope %/d:pct2", "--column", "r2:R²:f2",
                          "--param", "window=10", "--run-at", "2026-10-15T21:05:00Z", "--check"],
                         capture_output=True, text=True, env=dict(os.environ, PYTHONPATH=ROOT), check=True)
    p = json.loads(out.stdout)
    assert p["as_of"] == "2026-10-15" and p["params"] == {"window": 10}
    assert [(r["ticker"], r["rank"]) for r in p["rows"]] == [("FIGS", 1), ("MRNA", 2)]
    assert p["rows"][0]["r2"] == 0.94 and p["rows"][0]["window_start"] == "2026-10-02"
    sc.validate_payload(p)
