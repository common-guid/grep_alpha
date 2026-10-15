"""Alpaca paper positions: read-only client, cache, states, key handling. Alpaca is mocked."""
import inspect
import json
import logging
import os
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from grep_alpha.src import paper_positions as pp  # noqa: E402

FAKE_KEY = "PKTESTKEY000000000000"
FAKE_SECRET = "s3cr3t-test-value-should-never-appear"
RAW = [
    {"symbol": "NVDA", "qty": "10", "side": "long", "avg_entry_price": "120.5", "current_price": "125",
     "market_value": "1250", "unrealized_pl": "45", "unrealized_plpc": "0.0373"},
    {"symbol": "TSLA", "qty": "-5", "side": "short", "avg_entry_price": "250", "current_price": "240",
     "market_value": "-1200", "unrealized_pl": "50", "unrealized_plpc": "0.04"},
]


class Clock:
    def __init__(self):
        self.t = 1000.0

    def __call__(self):
        return self.t


@pytest.fixture
def keys(monkeypatch):
    monkeypatch.delenv("GA_ENV", raising=False)
    monkeypatch.delenv("GA_POSITIONS_FIXTURE", raising=False)
    monkeypatch.setenv(pp.KEY_ENV, FAKE_KEY)
    monkeypatch.setenv(pp.SECRET_ENV, FAKE_SECRET)


def make(fetcher, clock=None):
    return pp.PositionsService(fetcher=fetcher, clock=clock or Clock())


def test_unconfigured_without_keys(monkeypatch):
    for k in (pp.KEY_ENV, pp.SECRET_ENV, "GA_ENV", "GA_POSITIONS_FIXTURE"):
        monkeypatch.delenv(k, raising=False)
    calls = []
    r = make(lambda *a: calls.append(a) or []).get()
    assert r["status"] == "unconfigured" and r["positions"] == [] and calls == []


def test_refuses_non_paper_key(monkeypatch, keys):
    monkeypatch.setenv(pp.KEY_ENV, "AKLIVEKEY")
    calls = []
    r = make(lambda *a: calls.append(a) or []).get()
    assert r["status"] == "unconfigured" and "PK" in r["error"] and calls == []


def test_ok_normalizes_and_sorts(keys):
    r = make(lambda k, s: list(reversed(RAW))).get()
    assert r["status"] == "ok" and r["stale"] is False and r["error"] is None and r["fetched_at"].endswith("Z")
    nv, ts = r["positions"]
    assert nv == {"symbol": "NVDA", "side": "long", "qty": 10.0, "avg_entry_price": 120.5, "current_price": 125.0,
                  "market_value": 1250.0, "unrealized_pl": 45.0, "unrealized_plpc": 0.0373}
    assert ts["side"] == "short" and ts["qty"] == 5.0


def test_empty_account(keys):
    r = make(lambda k, s: []).get()
    assert r["status"] == "ok" and r["positions"] == []


def test_cache_one_upstream_call_within_ttl(keys):
    clock, calls = Clock(), []
    svc = make(lambda k, s: calls.append(1) or RAW, clock)
    svc.get(); clock.t += 59; svc.get()
    assert len(calls) == 1
    clock.t += 2; svc.get()
    assert len(calls) == 2


def test_error_without_snapshot(keys):
    def boom(k, s):
        raise pp.PositionsError("Could not reach Alpaca (URLError)")
    r = make(boom).get()
    assert r["status"] == "error" and r["positions"] == [] and "reach Alpaca" in r["error"]


def test_error_serves_stale_snapshot(keys):
    clock, state = Clock(), {"fail": False}

    def f(k, s):
        if state["fail"]:
            raise pp.PositionsError("Alpaca returned HTTP 503")
        return RAW
    svc = make(f, clock)
    assert svc.get()["stale"] is False
    state["fail"] = True; clock.t += 61
    r = svc.get()
    assert r["status"] == "ok" and r["stale"] is True and len(r["positions"]) == 2 and "503" in r["error"]


def test_keys_never_in_response_or_logs(keys, caplog):
    caplog.set_level(logging.DEBUG)

    def boom(k, s):
        raise RuntimeError(f"bad {k} {s}")  # even if an exception carries them
    svc = make(boom)
    blob = json.dumps(svc.get()) + caplog.text
    assert FAKE_KEY not in blob and FAKE_SECRET not in blob


def test_module_is_read_only():
    src = inspect.getsource(pp)
    assert pp.PAPER_BASE_URL == "https://paper-api.alpaca.markets"
    assert 'method="GET"' in src
    for word in ("POST", "DELETE", "PATCH", "/v2/orders", "api.alpaca.markets/v2/orders"):
        assert word not in src.replace("GA_POSITIONS_FIXTURE", ""), word
    public = [n for n, o in vars(pp).items() if callable(o) and not n.startswith("_")]
    assert not any(w in n.lower() for n in public for w in ("order", "submit", "cancel", "close", "liquidate"))
    assert "BASE_URL" not in "".join(k for k in os.environ if k.startswith("ALPACA_PAPER"))


def test_base_url_not_overridable(monkeypatch, keys):
    monkeypatch.setenv("APCA_API_BASE_URL", "https://api.alpaca.markets")
    seen = {}

    class Resp:
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def read(self): return b"[]"

    def fake_urlopen(req, timeout):
        seen["url"], seen["method"] = req.full_url, req.get_method()
        return Resp()
    monkeypatch.setattr(pp.urllib.request, "urlopen", fake_urlopen)
    assert pp.PositionsService().get()["status"] == "ok"
    assert seen == {"url": "https://paper-api.alpaca.markets/v2/positions", "method": "GET"}


def test_fixture_mode_only_when_ga_env_test(monkeypatch, tmp_path):
    fx = tmp_path / "p.json"
    fx.write_text(json.dumps(RAW))
    for k in (pp.KEY_ENV, pp.SECRET_ENV):
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setenv("GA_POSITIONS_FIXTURE", str(fx))
    monkeypatch.delenv("GA_ENV", raising=False)
    assert pp.PositionsService().get()["status"] == "unconfigured"
    monkeypatch.setenv("GA_ENV", "test")
    assert len(pp.PositionsService().get()["positions"]) == 2
    fx.write_text(json.dumps({"error": "simulated outage"}))
    r = pp.PositionsService().get()
    assert r["status"] == "error" and r["error"] == "simulated outage"


def test_api_endpoint_marks_on_watchlist(monkeypatch, tmp_path):
    from fastapi.testclient import TestClient
    import backend.main as m
    fx = tmp_path / "p.json"
    fx.write_text(json.dumps(RAW + [{"symbol": "ZZZQ", "qty": "1", "side": "long"}]))
    monkeypatch.setenv("GA_ENV", "test")
    monkeypatch.setenv("GA_POSITIONS_FIXTURE", str(fx))
    monkeypatch.setattr(m, "positions_service", pp.PositionsService())
    monkeypatch.setattr(m, "get_flipcharts_watchlist_items", lambda: [{"symbol": "NVDA"}, {"symbol": "TSLA"}])
    r = TestClient(m.app).get("/api/positions").json()
    assert r["status"] == "ok"
    assert {p["symbol"]: p["on_watchlist"] for p in r["positions"]} == {"NVDA": True, "TSLA": True, "ZZZQ": False}
