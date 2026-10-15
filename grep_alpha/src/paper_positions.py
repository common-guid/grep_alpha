"""Read-only view of the Alpaca PAPER account's open positions.

Safety properties (each is covered by a test):
- The host is a constant: https://paper-api.alpaca.markets. It is not configurable,
  so a live-trading URL can never be swapped in through the environment.
- The only network call is GET /v2/positions. There is no order, cancel, close or
  any other write function in this module.
- Keys come from ALPACA_PAPER_KEY_ID / ALPACA_PAPER_SECRET_KEY, are read at call
  time, are refused unless the key id starts with "PK" (Alpaca's paper prefix), and
  are never logged or returned.
- Results are cached for CACHE_TTL_SECONDS with a single-flight lock. If Alpaca
  fails, the last good snapshot is served with stale=True.

Test-only fixture mode: when GA_ENV=test and GA_POSITIONS_FIXTURE points at a JSON
file, that file is used instead of Alpaca. It holds either a list of Alpaca
position objects or {"error": "message"} to simulate an outage.
"""
from __future__ import annotations

import json
import logging
import os
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional

log = logging.getLogger("grep_alpha.paper_positions")

PAPER_BASE_URL = "https://paper-api.alpaca.markets"
POSITIONS_PATH = "/v2/positions"
KEY_ENV = "ALPACA_PAPER_KEY_ID"
SECRET_ENV = "ALPACA_PAPER_SECRET_KEY"
CACHE_TTL_SECONDS = 60.0
HTTP_TIMEOUT_SECONDS = 10.0


class PositionsError(Exception):
    """Alpaca could not be reached or returned an error. Message never contains keys."""


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _to_float(v: Any) -> Optional[float]:
    try:
        return None if v is None or v == "" else float(v)
    except (TypeError, ValueError):
        return None


def normalize_position(raw: Dict[str, Any]) -> Dict[str, Any]:
    """Map an Alpaca position object to the fields the app uses. qty is always positive."""
    side = str(raw.get("side") or "long").lower()
    qty = _to_float(raw.get("qty"))
    return {
        "symbol": str(raw.get("symbol", "")).upper(),
        "side": "short" if side == "short" else "long",
        "qty": abs(qty) if qty is not None else None,
        "avg_entry_price": _to_float(raw.get("avg_entry_price")),
        "current_price": _to_float(raw.get("current_price")),
        "market_value": _to_float(raw.get("market_value")),
        "unrealized_pl": _to_float(raw.get("unrealized_pl")),
        "unrealized_plpc": _to_float(raw.get("unrealized_plpc")),
    }


def _http_get_positions(key_id: str, secret: str) -> List[Dict[str, Any]]:
    """The one network call: GET {PAPER_BASE_URL}/v2/positions."""
    req = urllib.request.Request(
        PAPER_BASE_URL + POSITIONS_PATH,
        method="GET",
        headers={"APCA-API-KEY-ID": key_id, "APCA-API-SECRET-KEY": secret, "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT_SECONDS) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise PositionsError(f"Alpaca returned HTTP {e.code}") from None
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise PositionsError(f"Could not reach Alpaca ({type(e).__name__})") from None
    except ValueError:
        raise PositionsError("Alpaca returned invalid JSON") from None
    if not isinstance(data, list):
        raise PositionsError("Unexpected Alpaca response shape")
    return data


def _fixture_path() -> Optional[str]:
    if os.environ.get("GA_ENV") == "test" and os.environ.get("GA_POSITIONS_FIXTURE"):
        return os.environ["GA_POSITIONS_FIXTURE"]
    return None


def _read_fixture(path: str) -> List[Dict[str, Any]]:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if isinstance(data, dict) and data.get("error"):
        raise PositionsError(str(data["error"]))
    if not isinstance(data, list):
        raise PositionsError("Fixture must be a list or {\"error\": ...}")
    return data


class PositionsService:
    """Cached, read-only positions source. One instance per process."""

    def __init__(self, ttl: float = CACHE_TTL_SECONDS,
                 fetcher: Callable[[str, str], List[Dict[str, Any]]] = _http_get_positions,
                 clock: Callable[[], float] = time.monotonic):
        self.ttl = ttl
        self._fetcher = fetcher
        self._clock = clock
        self._lock = threading.Lock()
        self._good: Optional[Dict[str, Any]] = None  # last successful snapshot
        self._good_at: float = 0.0
        self._last_error: Optional[str] = None
        self._error_at: float = 0.0

    @staticmethod
    def credentials() -> Optional[tuple]:
        key, secret = os.environ.get(KEY_ENV, "").strip(), os.environ.get(SECRET_ENV, "").strip()
        if not key or not secret:
            return None
        return key, secret

    def configured(self) -> bool:
        return _fixture_path() is not None or self.credentials() is not None

    def invalidate(self) -> None:
        with self._lock:
            self._good_at = 0.0
            self._error_at = 0.0

    def refresh_if_older_than(self, seconds: float) -> None:
        """Force the next get() to hit Alpaca if the snapshot is older than `seconds`."""
        with self._lock:
            if self._clock() - self._good_at >= seconds:
                self._good_at = 0.0
                self._error_at = 0.0

    def _fetch(self) -> List[Dict[str, Any]]:
        fx = _fixture_path()
        if fx:
            return _read_fixture(fx)
        creds = self.credentials()
        if creds is None:
            raise RuntimeError("unconfigured")
        return self._fetcher(*creds)

    def get(self) -> Dict[str, Any]:
        """Return {status, fetched_at, stale, positions, error}. Never raises."""
        fx = _fixture_path()
        creds = self.credentials()
        if fx is None:
            if creds is None:
                return {"status": "unconfigured", "fetched_at": None, "stale": False, "positions": [],
                        "error": f"Paper keys not installed ({KEY_ENV} / {SECRET_ENV})"}
            if not creds[0].startswith("PK"):
                return {"status": "unconfigured", "fetched_at": None, "stale": False, "positions": [],
                        "error": f"{KEY_ENV} is not a paper key (expected PK prefix); refusing to call Alpaca"}
        with self._lock:
            now = self._clock()
            if self._good is not None and now - self._good_at < self.ttl:
                return dict(self._good)
            if self._last_error and now - self._error_at < self.ttl:
                return self._error_response()
            try:
                raw = self._fetch()
                positions = [normalize_position(p) for p in raw if isinstance(p, dict) and p.get("symbol")]
                positions.sort(key=lambda p: p["symbol"])
                self._good = {"status": "ok", "fetched_at": _utc_now_iso(), "stale": False,
                              "positions": positions, "error": None}
                self._good_at = now
                self._last_error = None
                return dict(self._good)
            except PositionsError as e:
                self._last_error, self._error_at = str(e), now
                log.warning("paper positions fetch failed: %s", e)
                return self._error_response()
            except Exception as e:  # never leak details that could include headers
                self._last_error, self._error_at = f"Positions fetch failed ({type(e).__name__})", now
                log.warning("paper positions fetch failed: %s", type(e).__name__)
                return self._error_response()

    def _error_response(self) -> Dict[str, Any]:
        if self._good is not None:
            out = dict(self._good)
            out.update({"stale": True, "error": self._last_error})
            return out
        return {"status": "error", "fetched_at": None, "stale": False, "positions": [], "error": self._last_error}

    def held_symbols(self) -> set:
        """Symbols in the last good snapshot (no network call)."""
        with self._lock:
            return {p["symbol"] for p in (self._good or {}).get("positions", [])}
