"""`added` = frozen first-seen date; `date` = last updated."""
import datetime
import importlib.util
import os
import shutil
import tempfile

from src.yaml_manager import YAMLManager

_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
_spec = importlib.util.spec_from_file_location(
    "merge_watchlists", os.path.join(_ROOT, "update_pipeline", "scripts", "merge_watchlists.py"))
mw = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(mw)

TODAY = datetime.date.today().strftime("%Y-%m-%d")


def test_merge_new_symbol_gets_added_today():
    out = mw.merge_flipcharts_watchlist([], {"tickers": [{"symbol": "new", "thesis": "x", "tags": ""}]})
    assert out[0]["symbol"] == "NEW"
    assert out[0]["added"] == TODAY and out[0]["date"] == TODAY


def test_merge_existing_symbol_keeps_added_and_bumps_date():
    existing = [{"symbol": "AAPL", "status": "watching", "target_entry": None, "thesis": "old",
                 "tags": "Big_Tech", "date": "2026-08-01", "added": "2026-07-23"}]
    out = mw.merge_flipcharts_watchlist(existing, {"tickers": [{"symbol": "AAPL", "thesis": "fresh", "tags": ""}]})
    assert out[0]["added"] == "2026-07-23"
    assert out[0]["date"] == TODAY


def test_merge_existing_without_added_does_not_invent_one():
    existing = [{"symbol": "MSFT", "status": "watching", "target_entry": None, "thesis": "t", "tags": "Software"}]
    out = mw.merge_flipcharts_watchlist(existing, {"tickers": [{"symbol": "MSFT", "thesis": "new", "tags": ""}]})
    assert "added" not in out[0]


def test_merge_untouched_entry_passes_through():
    existing = [{"symbol": "X", "date": "2026-09-01", "added": "2026-07-28"}]
    out = mw.merge_flipcharts_watchlist(existing, {"tickers": []})
    assert out == existing


def _mgr():
    d = tempfile.mkdtemp()
    with open(os.path.join(d, "t.yaml"), "w") as f:
        f.write("name: T\ntickers:\n  - symbol: AAPL\n    status: watching\n    thesis: ''\n"
                "    date: '2026-08-01'\n    added: '2026-07-23'\n")
    return d, YAMLManager(d)


def test_yaml_manager_add_sets_added_only_for_new():
    d, m = _mgr()
    try:
        m.add_ticker("t", "MSFT", "thesis")
        m.add_ticker("t", "AAPL", "dup")  # existing: no-op
        tk = {t["symbol"]: t for t in m.get_watchlist("t")["tickers"]}
        assert tk["MSFT"]["added"] == TODAY and tk["MSFT"]["date"] == TODAY
        assert tk["AAPL"]["added"] == "2026-07-23" and tk["AAPL"]["date"] == "2026-08-01"
    finally:
        shutil.rmtree(d)


def test_yaml_manager_updates_never_change_added():
    d, m = _mgr()
    try:
        m.update_ticker_status("t", "AAPL", "trimmed")
        m.update_thesis("t", "AAPL", "more")
        t = m.get_watchlist("t")["tickers"][0]
        assert t["added"] == "2026-07-23"
        assert t["date"] == TODAY
    finally:
        shutil.rmtree(d)


def test_legacy_core_holding_status_maps_to_watching():
    from backend.main import TickerCreate, TickerUpdate
    assert TickerCreate(symbol="AAPL", status="core_holding").status == "watching"
    assert TickerUpdate(status="core_holding").status == "watching"
    assert TickerUpdate(status="trimmed").status == "trimmed"
    assert TickerUpdate().status is None
