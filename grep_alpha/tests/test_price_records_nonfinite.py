"""Regression: one non-finite OHLC bar must not 500 /api/prices.

Production incident 2026-10-21: 286 `daily_prices` rows dated 2026-10-20 had
NULL open/high/low/close with a non-null volume. pandas reads SQL NULL as NaN,
`_price_records` emitted `float(nan)`, and Starlette's JSONResponse
(`json.dumps(..., allow_nan=False)`) raised, failing every symbol.

No network: yfinance / Alpaca are replaced with in-memory fakes.
"""
import json
import math
import os
import sqlite3
import sys
import tempfile
from datetime import date, datetime, timedelta

import pandas as pd
import pytest

WORKSPACE_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if WORKSPACE_ROOT not in sys.path:
    sys.path.insert(0, WORKSPACE_ROOT)

from fastapi.testclient import TestClient

from backend import main
from grep_alpha.src import data_fetcher, database

NAN = float("nan")
INF = float("inf")


def _frame(rows):
    """Build a frame shaped like get_prices' visible_df."""
    df = pd.DataFrame(
        rows,
        columns=["date", "open", "high", "low", "close", "volume",
                 "ema10", "sma50", "sma200", "atr14"],
    )
    df["date_dt"] = pd.to_datetime(df["date"])
    return df


def _encode(records):
    # Same encoder settings Starlette's JSONResponse.render uses.
    return json.dumps(records, ensure_ascii=False, allow_nan=False,
                      indent=None, separators=(",", ":"))


def test_nan_ohlc_bar_is_dropped_and_response_encodes():
    df = _frame([
        ("2026-10-16", 100.0, 101.0, 99.0, 100.5, 1_000_000, 100.0, 98.0, 90.0, 1.5),
        # Mirrors the prod row: NULL OHLC (NaN in pandas), volume present.
        ("2026-10-20", NAN, NAN, NAN, NAN, 35_678_066, 100.1, 98.1, 90.1, 1.5),
        ("2026-10-21", 102.0, 103.0, 101.0, 102.5, 1_100_000, 100.4, 98.2, 90.2, 1.6),
    ])
    records = main._price_records(df)
    payload = _encode(records)  # raises ValueError on master
    assert [r["time"] for r in records] == ["2026-10-16", "2026-10-21"]
    assert "2026-10-20" not in payload


@pytest.mark.parametrize("col", ["open", "high", "low", "close"])
@pytest.mark.parametrize("bad", [NAN, INF, -INF, None])
def test_any_non_finite_ohlc_field_drops_bar(col, bad):
    row = {"date": "2026-10-20", "open": 10.0, "high": 11.0, "low": 9.0,
           "close": 10.5, "volume": 5, "ema10": 10.0, "sma50": 10.0,
           "sma200": 10.0, "atr14": 1.0}
    good = dict(row, date="2026-10-21")
    row[col] = bad
    df = pd.DataFrame([row, good])
    records = main._price_records(df)
    _encode(records)
    assert [r["time"] for r in records] == ["2026-10-21"]


@pytest.mark.parametrize("bad", [NAN, INF, -INF, None])
def test_non_finite_indicator_becomes_none(bad):
    df = _frame([
        ("2026-10-21", 10.0, 11.0, 9.0, 10.5, 5, bad, bad, bad, bad),
    ])
    records = main._price_records(df)
    _encode(records)
    assert len(records) == 1
    for k in ("ema10", "sma50", "sma200", "atr14"):
        assert records[0][k] is None


def test_nn_handles_inf():
    assert main._nn(NAN) is None
    assert main._nn(INF) is None
    assert main._nn(-INF) is None
    assert main._nn(None) is None
    assert main._nn(1.25) == 1.25


@pytest.mark.parametrize("bad", [NAN, None])
def test_missing_volume_on_valid_bar_does_not_raise(bad):
    df = pd.DataFrame([{
        "date": "2026-10-21", "open": 10.0, "high": 11.0, "low": 9.0,
        "close": 10.5, "volume": bad, "ema10": 10.0, "sma50": NAN,
        "sma200": NAN, "atr14": 1.0,
    }])
    records = main._price_records(df)
    _encode(records)
    assert len(records) == 1
    assert records[0]["close"] == 10.5
    # Omitted (not null): the chart adapter filters volume on `!== undefined`.
    assert "volume" not in records[0]


def test_get_prices_endpoint_skips_null_ohlc_row():
    """End to end through FastAPI/Starlette with a NULL-OHLC row in SQLite."""
    today = datetime.now().date()
    days = [today - timedelta(days=i) for i in range(40, 0, -1)]
    bad_day = days[-5].isoformat()
    with tempfile.TemporaryDirectory() as tmp:
        original = database.DB_PATH
        database.DB_PATH = os.path.join(tmp, "nan_ohlc.db")
        try:
            database.init_db()
            with sqlite3.connect(database.DB_PATH) as conn:
                for i, d in enumerate(days):
                    ds = d.isoformat()
                    if ds == bad_day:
                        conn.execute(
                            "INSERT INTO daily_prices VALUES (?, 'ZZNAN', NULL, NULL, NULL, NULL, 35678066)",
                            (ds,))
                    else:
                        p = 100.0 + i
                        conn.execute(
                            "INSERT INTO daily_prices VALUES (?, 'ZZNAN', ?, ?, ?, ?, 1000)",
                            (ds, p, p + 1, p - 1, p + 0.5))
                conn.commit()
            with TestClient(main.app) as client:
                r = client.get("/api/prices?symbol=ZZNAN&timeframe=3M")
            assert r.status_code == 200, r.text
            data = r.json()
            times = [row["time"] for row in data]
            assert bad_day not in times
            assert len(times) == len(days) - 1
        finally:
            database.DB_PATH = original


class _FakeYfTicker:
    def __init__(self, df):
        self._df = df

    def history(self, **kwargs):
        return self._df


class _FakeYf:
    def __init__(self, df):
        self._df = df

    def Ticker(self, sym):
        return _FakeYfTicker(self._df)


def _ohlcv_frame(cols):
    idx = pd.to_datetime(["2026-10-16", "2026-10-20", "2026-10-21"])
    return pd.DataFrame({
        cols[0]: [100.0, NAN, 102.0],
        cols[1]: [101.0, NAN, 103.0],
        cols[2]: [99.0, NAN, 101.0],
        cols[3]: [100.5, INF, 102.5],
        cols[4]: [1_000_000, 35_678_066, 1_100_000],
    }, index=idx)


def test_yfinance_fetch_skips_non_finite_ohlc(monkeypatch):
    df = _ohlcv_frame(["Open", "High", "Low", "Close", "Volume"])
    monkeypatch.setattr(data_fetcher, "yf", _FakeYf(df))
    out = data_fetcher.fetch_ticker_data_yfinance("AAPL", date(2026, 10, 16), date(2026, 10, 21))
    assert [r[0] for r in out] == ["2026-10-16", "2026-10-21"]
    for r in out:
        assert all(math.isfinite(x) for x in r[2:6])


class _FakeBars:
    def __init__(self, df):
        self.df = df


class _FakeAlpaca:
    def __init__(self, df):
        self._df = df

    def get_bars(self, *args, **kwargs):
        return _FakeBars(self._df)


def test_alpaca_fetch_skips_non_finite_ohlc(monkeypatch):
    df = _ohlcv_frame(["open", "high", "low", "close", "volume"])
    if data_fetcher.TimeFrame is None:
        monkeypatch.setattr(data_fetcher, "TimeFrame", type("TF", (), {"Day": "1Day"}))
    out = data_fetcher.fetch_ticker_data_alpaca(
        "aapl", date(2026, 10, 16), date(2026, 10, 21), api=_FakeAlpaca(df))
    assert [r[0] for r in out] == ["2026-10-16", "2026-10-21"]
    assert all(r[1] == "AAPL" for r in out)


def _volume_frame(cols, bad):
    """Three finite-OHLC bars; the middle one has a bad volume.

    The volume column is object dtype so a None stays None (a float column
    would coerce it to NaN)."""
    idx = pd.to_datetime(["2026-10-16", "2026-10-20", "2026-10-21"])
    return pd.DataFrame({
        cols[0]: [100.0, 101.0, 102.0],
        cols[1]: [101.0, 102.0, 103.0],
        cols[2]: [99.0, 100.0, 101.0],
        cols[3]: [100.5, 101.5, 102.5],
        cols[4]: pd.Series([1_000_000, bad, 1_100_000], index=idx, dtype=object),
    }, index=idx)


VOLUME_BAD = [NAN, None, INF, -INF]


@pytest.mark.parametrize("bad", VOLUME_BAD, ids=["nan", "none", "inf", "-inf"])
def test_yfinance_fetch_skips_non_finite_volume(monkeypatch, bad):
    df = _volume_frame(["Open", "High", "Low", "Close", "Volume"], bad)
    monkeypatch.setattr(data_fetcher, "yf", _FakeYf(df))
    out = data_fetcher.fetch_ticker_data_yfinance("AAPL", date(2026, 10, 16), date(2026, 10, 21))
    assert [r[0] for r in out] == ["2026-10-16", "2026-10-21"]
    assert [r[6] for r in out] == [1_000_000, 1_100_000]
    assert all(isinstance(r[6], int) for r in out)


@pytest.mark.parametrize("bad", VOLUME_BAD, ids=["nan", "none", "inf", "-inf"])
def test_alpaca_fetch_skips_non_finite_volume(monkeypatch, bad):
    df = _volume_frame(["open", "high", "low", "close", "volume"], bad)
    if data_fetcher.TimeFrame is None:
        monkeypatch.setattr(data_fetcher, "TimeFrame", type("TF", (), {"Day": "1Day"}))
    out = data_fetcher.fetch_ticker_data_alpaca(
        "aapl", date(2026, 10, 16), date(2026, 10, 21), api=_FakeAlpaca(df))
    assert [r[0] for r in out] == ["2026-10-16", "2026-10-21"]
    assert [r[6] for r in out] == [1_000_000, 1_100_000]
    assert all(isinstance(r[6], int) for r in out)
