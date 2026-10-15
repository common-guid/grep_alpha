"""Auto-add of held paper symbols to FlipCharts/watchlist.yaml and persistence across overwrites."""
import json
import os
import sys

import pytest
import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from grep_alpha.src.paper_watchlist import PaperWatchlist, PAPER_TAG  # noqa: E402

BASE = """- symbol: AAPL
  status: watching
  target_entry: 170
  thesis: 2026-09-03:Cash flow
  tags: Big_Tech, Software
  date: '2026-10-12'
  added: '2026-07-23'
- symbol: NVDA
  status: watching
  target_entry: null
  thesis: ''
  tags: Semi-Fabless
  added: '2026-07-23'
"""


@pytest.fixture
def pw(tmp_path):
    y = tmp_path / "watchlist.yaml"
    y.write_text(BASE)
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "watchlist.yaml").write_text(BASE)
    w = PaperWatchlist(str(y), str(tmp_path / "state"), backups_dir=str(tmp_path / "bk"),
                       mirror_paths=[str(dist / "watchlist.yaml")], today=lambda: "2026-10-15")
    return w, y, dist / "watchlist.yaml", tmp_path


def items(path):
    return {i["symbol"]: i for i in yaml.safe_load(path.read_text())}


def test_sync_adds_missing_with_paper_tag_and_added(pw):
    w, y, dist, _ = pw
    r = w.sync(["nvda", "ZZZQ"], source="test")
    assert r == {"added": ["ZZZQ"], "already_on_watchlist": ["NVDA"], "restored": []}
    z = items(y)["ZZZQ"]
    assert z == {"symbol": "ZZZQ", "status": "watching", "target_entry": None, "thesis": "",
                 "tags": PAPER_TAG, "date": "2026-10-15", "added": "2026-10-15"}
    assert "ZZZQ" in items(dist), "dist mirror updated"


def test_sync_is_idempotent_and_leaves_existing_bytes(pw):
    w, y, _, tmp = pw
    w.sync(["ZZZQ"], source="test")
    after_first = y.read_text()
    r = w.sync(["ZZZQ", "NVDA"], source="test")
    assert r["added"] == [] and y.read_text() == after_first
    assert after_first.startswith(BASE), "existing entries byte-identical; new block appended"
    assert any(f.endswith("_paper.yaml") for f in os.listdir(tmp / "bk")), "backup taken"
    log = (tmp / "state" / "paper_autoadd.log").read_text().strip().splitlines()
    assert [json.loads(l)["event"] for l in log] == ["auto_add"]


def test_appends_in_place_keeping_inode(pw):
    w, y, _, _ = pw
    ino = os.stat(y).st_ino
    w.sync(["ZZZQ"], source="test")
    assert os.stat(y).st_ino == ino


def test_overwrite_is_restored_with_original_added_date(pw):
    w, y, _, _ = pw
    w.sync(["ZZZQ"], source="test")
    # Simulate a deploy / weekly refresh replacing the file with master's copy.
    tmp = str(y) + ".new"
    open(tmp, "w").write(BASE)
    os.replace(tmp, y)
    w2 = PaperWatchlist(str(y), w.state_dir, today=lambda: "2026-10-20")  # e.g. after a restart
    assert w2.reconcile() == ["ZZZQ"]
    z = items(y)["ZZZQ"]
    assert z["added"] == "2026-10-15" and z["tags"] == PAPER_TAG
    assert w2.reconcile() == []


def test_watcher_check_once_restores_after_change(pw):
    w, y, _, _ = pw
    w.sync(["ZZZQ"], source="test")
    assert w.check_once() == []  # our own write is not a change
    y.write_text(BASE + "- symbol: NEW1\n  status: watching\n")
    assert w.check_once() == ["ZZZQ"]
    assert {"NEW1", "ZZZQ"} <= set(items(y))


def test_symbols_already_on_list_are_not_restored(pw):
    w, y, _, _ = pw
    w.sync(["NVDA"], source="test")
    y.write_text(BASE.split("- symbol: NVDA")[0])
    assert w.reconcile() == []


def test_manager_removal_honored_only_when_not_held(pw):
    w, y, _, _ = pw
    w.sync(["ZZZQ", "QQQZ"], source="test")
    new_text = BASE  # operator deleted both in the Manager
    assert w.forget_removed(new_text, held={"QQQZ"}) == ["ZZZQ"]
    y.write_text(new_text)
    assert w.reconcile() == ["QQQZ"], "still held -> comes back; not held -> stays removed"
    assert "ZZZQ" not in items(y)


def test_corrupt_record_is_treated_as_empty(pw):
    w, _, _, tmp = pw
    (tmp / "state").mkdir()
    (tmp / "state" / "paper_autoadds.json").write_text("{not json")
    assert w.reconcile() == []


def test_api_sync_endpoint(monkeypatch, tmp_path):
    from fastapi.testclient import TestClient
    import backend.main as m
    from grep_alpha.src.paper_positions import PositionsService
    y = tmp_path / "watchlist.yaml"
    y.write_text(BASE)
    fx = tmp_path / "p.json"
    fx.write_text(json.dumps([{"symbol": "NVDA", "qty": "1"}, {"symbol": "ZZZQ", "qty": "2"}]))
    monkeypatch.setenv("GA_ENV", "test")
    monkeypatch.setenv("GA_POSITIONS_FIXTURE", str(fx))
    monkeypatch.setattr(m, "positions_service", PositionsService())
    monkeypatch.setattr(m, "paper_watchlist", PaperWatchlist(str(y), str(tmp_path / "st")))
    c = TestClient(m.app)
    r = c.post("/api/positions/sync-watchlist")
    assert r.status_code == 200
    assert r.json()["added"] == ["ZZZQ"] and r.json()["held"] == ["NVDA", "ZZZQ"]
    assert c.post("/api/positions/sync-watchlist").json()["added"] == []
    assert c.get("/api/positions").status_code == 200
    fx.write_text(json.dumps({"error": "down"}))
    monkeypatch.setattr(m, "positions_service", PositionsService())
    r = c.post("/api/positions/sync-watchlist")
    assert r.status_code == 503 and r.json()["status"] == "error"


def test_get_positions_has_no_side_effects(monkeypatch, tmp_path):
    from fastapi.testclient import TestClient
    import backend.main as m
    from grep_alpha.src.paper_positions import PositionsService
    y = tmp_path / "watchlist.yaml"
    y.write_text(BASE)
    fx = tmp_path / "p.json"
    fx.write_text(json.dumps([{"symbol": "ZZZQ", "qty": "2"}]))
    monkeypatch.setenv("GA_ENV", "test")
    monkeypatch.setenv("GA_POSITIONS_FIXTURE", str(fx))
    monkeypatch.setattr(m, "positions_service", PositionsService())
    monkeypatch.setattr(m, "paper_watchlist", PaperWatchlist(str(y), str(tmp_path / "st")))
    monkeypatch.setattr(m, "get_flipcharts_watchlist_items", lambda: yaml.safe_load(y.read_text()))
    r = TestClient(m.app).get("/api/positions").json()
    assert r["positions"][0]["on_watchlist"] is False
    assert y.read_text() == BASE and not (tmp_path / "st").exists()
