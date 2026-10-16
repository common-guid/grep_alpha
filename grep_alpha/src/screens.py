"""Screen results handed to the app by an external screener (e.g. Grep Alpha Trader).

Contract: JSON v1, see docs/screens-api.md. The app only stores and serves results;
it never runs screens. Storage is the app DB's `screen_runs` table (created by
database.init_db). The last KEEP_RUNS runs per screen are kept; older ones are
pruned on insert. Reads are side-effect free.
"""
from __future__ import annotations

import json
import math
import re
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional, Tuple

KEEP_RUNS = 30
MAX_ROWS = 1000
MAX_COLUMNS = 8
MAX_BODY_BYTES = 1_000_000

NAME_RE = re.compile(r"^[a-z0-9][a-z0-9_.-]{0,63}$")
TICKER_RE = re.compile(r"^[A-Z][A-Z0-9.\-]{0,9}$")
KEY_RE = re.compile(r"^[a-z_][a-z0-9_]{0,39}$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
RESERVED_KEYS = {"ticker", "rank", "on_watchlist"}
# Display formats the frontend understands. fN = fixed N decimals; pctN = value is
# already in percent units, shown with sign and "%"; fracpctN = a fraction (0.05)
# shown as percent; usd = $ with 2 decimals; int; text = string value.
FORMATS = {f"f{i}" for i in range(5)} | {f"pct{i}" for i in range(5)} | \
    {f"fracpct{i}" for i in range(5)} | {"usd", "int", "text"}


class ScreenValidationError(ValueError):
    def __init__(self, errors: List[str]):
        super().__init__("; ".join(errors[:10]))
        self.errors = errors


def _parse_run_at(v: Any) -> Optional[str]:
    if not isinstance(v, str):
        return None
    try:
        dt = datetime.fromisoformat(v.replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        return None
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _valid_date(v: Any) -> bool:
    if not isinstance(v, str) or not DATE_RE.match(v):
        return False
    try:
        datetime.strptime(v, "%Y-%m-%d")
        return True
    except ValueError:
        return False


def validate_payload(p: Any) -> Dict[str, Any]:
    """Validate a v1 payload and return the normalized form. Raises ScreenValidationError."""
    errs: List[str] = []
    if not isinstance(p, dict):
        raise ScreenValidationError(["payload must be a JSON object"])
    if p.get("version") != 1:
        errs.append("version must be 1")
    name = p.get("screen")
    if not isinstance(name, str) or not NAME_RE.match(name):
        errs.append("screen must match ^[a-z0-9][a-z0-9_.-]{0,63}$ (lowercase)")
    run_at = _parse_run_at(p.get("run_at"))
    if run_at is None:
        errs.append("run_at must be an ISO 8601 timestamp with a timezone (UTC 'Z' preferred)")
    if not _valid_date(p.get("as_of")):
        errs.append("as_of must be YYYY-MM-DD (date of the last bar used)")
    params = p.get("params", {})
    if not isinstance(params, dict):
        errs.append("params must be an object")
    universe = p.get("universe", {})
    if not isinstance(universe, dict):
        errs.append("universe must be an object")
    source = p.get("source", "")
    if not isinstance(source, str) or len(source) > 100:
        errs.append("source must be a string (<=100 chars)")

    cols = p.get("columns")
    col_out: List[Dict[str, str]] = []
    if not isinstance(cols, list) or not (1 <= len(cols) <= MAX_COLUMNS):
        errs.append(f"columns must be a list of 1-{MAX_COLUMNS} column objects")
        cols = []
    seen_keys = set()
    for i, c in enumerate(cols):
        if not isinstance(c, dict):
            errs.append(f"columns[{i}] must be an object"); continue
        k, label, fmt = c.get("key"), c.get("label", c.get("key")), c.get("fmt", "f2")
        if not isinstance(k, str) or not KEY_RE.match(k) or k in RESERVED_KEYS:
            errs.append(f"columns[{i}].key invalid (snake_case, not ticker/rank)"); continue
        if k in seen_keys:
            errs.append(f"columns[{i}].key duplicate: {k}"); continue
        if not isinstance(label, str) or not (1 <= len(label) <= 24):
            errs.append(f"columns[{i}].label must be 1-24 chars"); continue
        if fmt not in FORMATS:
            errs.append(f"columns[{i}].fmt must be one of {sorted(FORMATS)}"); continue
        seen_keys.add(k)
        col_out.append({"key": k, "label": label, "fmt": fmt})
    fmt_by_key = {c["key"]: c["fmt"] for c in col_out}

    rows = p.get("rows")
    row_out: List[Dict[str, Any]] = []
    if not isinstance(rows, list):
        errs.append("rows must be a list")
        rows = []
    if len(rows) > MAX_ROWS:
        errs.append(f"rows: {len(rows)} > {MAX_ROWS} limit")
        rows = []
    tickers, ranks = set(), set()
    for i, r in enumerate(rows):
        if len(errs) > 50:
            break
        if not isinstance(r, dict):
            errs.append(f"rows[{i}] must be an object"); continue
        t = r.get("ticker")
        if not isinstance(t, str) or not TICKER_RE.match(t.strip().upper()):
            errs.append(f"rows[{i}].ticker invalid: {t!r}"); continue
        t = t.strip().upper()
        if t in tickers:
            errs.append(f"rows[{i}].ticker duplicate: {t}"); continue
        rank = r.get("rank")
        if not isinstance(rank, int) or isinstance(rank, bool) or rank < 1:
            errs.append(f"rows[{i}].rank must be an integer >= 1"); continue
        if rank in ranks:
            errs.append(f"rows[{i}].rank duplicate: {rank}"); continue
        out: Dict[str, Any] = {"ticker": t, "rank": rank}
        for k, v in r.items():
            if k in ("ticker", "rank"):
                continue
            if not isinstance(k, str) or not KEY_RE.match(k):
                errs.append(f"rows[{i}] key invalid: {k!r}"); continue
            if fmt_by_key.get(k) == "text" or k not in fmt_by_key:
                if v is not None and not isinstance(v, (str, int, float)) or isinstance(v, bool):
                    errs.append(f"rows[{i}].{k} must be a string or number"); continue
                out[k] = v if not isinstance(v, str) else v[:64]
            else:
                if v is not None and (isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v)):
                    errs.append(f"rows[{i}].{k} must be a finite number or null"); continue
                out[k] = v
        tickers.add(t); ranks.add(rank)
        row_out.append(out)
    if errs:
        raise ScreenValidationError(errs)
    row_out.sort(key=lambda r: r["rank"])
    return {"screen": name, "version": 1, "run_at": run_at, "as_of": p["as_of"], "params": params,
            "universe": universe, "source": source, "columns": col_out, "rows": row_out}


def store_run(conn_factory: Callable, payload: Dict[str, Any], keep: int = KEEP_RUNS) -> Tuple[int, bool, int]:
    """Insert (or replace the same screen+run_at) and prune. Returns (id, replaced, pruned)."""
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    with conn_factory() as conn:
        cur = conn.cursor()
        cur.execute("SELECT id FROM screen_runs WHERE name=? AND run_at=?", (payload["screen"], payload["run_at"]))
        existing = cur.fetchone()
        vals = (payload["as_of"], json.dumps(payload["params"]), json.dumps(payload["universe"]),
                json.dumps(payload["columns"]), json.dumps(payload["rows"]), len(payload["rows"]),
                payload["source"], now)
        if existing:
            cur.execute("""UPDATE screen_runs SET as_of=?, params_json=?, universe_json=?, columns_json=?,
                           rows_json=?, row_count=?, source=?, created_at=? WHERE id=?""", vals + (existing[0],))
            run_id, replaced = existing[0], True
        else:
            cur.execute("""INSERT INTO screen_runs (name, version, run_at, as_of, params_json, universe_json,
                           columns_json, rows_json, row_count, source, created_at)
                           VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                        (payload["screen"], payload["run_at"]) + vals)
            run_id, replaced = cur.lastrowid, False
        cur.execute("""DELETE FROM screen_runs WHERE name=? AND id NOT IN (
                         SELECT id FROM screen_runs WHERE name=? ORDER BY run_at DESC, id DESC LIMIT ?)""",
                    (payload["screen"], payload["screen"], keep))
        pruned = cur.rowcount
        conn.commit()
    return run_id, replaced, pruned


def ingest(conn_factory: Callable, raw: Any, keep: int = KEEP_RUNS):
    """Validate + store: the single path used by POST /api/screens and the drop folder.
    Returns (payload, run_id, replaced, pruned); raises ScreenValidationError."""
    payload = validate_payload(raw)
    run_id, replaced, pruned = store_run(conn_factory, payload, keep)
    return payload, run_id, replaced, pruned


_COLS = "id, name, version, run_at, as_of, params_json, universe_json, columns_json, rows_json, row_count, source, created_at"


def _row_to_run(r) -> Dict[str, Any]:
    return {"id": r[0], "screen": r[1], "version": r[2], "run_at": r[3], "as_of": r[4],
            "params": json.loads(r[5]), "universe": json.loads(r[6]), "columns": json.loads(r[7]),
            "rows": json.loads(r[8]), "row_count": r[9], "source": r[10], "received_at": r[11]}


def list_screens(conn_factory: Callable) -> List[Dict[str, Any]]:
    with conn_factory() as conn:
        rows = conn.execute("""SELECT name, id, run_at, as_of, row_count, source,
                                      (SELECT COUNT(*) FROM screen_runs s2 WHERE s2.name = s.name)
                               FROM screen_runs s
                               WHERE id = (SELECT id FROM screen_runs s3 WHERE s3.name = s.name
                                           ORDER BY run_at DESC, id DESC LIMIT 1)
                               ORDER BY name""").fetchall()
    return [{"screen": r[0], "runs": r[6],
             "latest": {"id": r[1], "run_at": r[2], "as_of": r[3], "row_count": r[4], "source": r[5]}} for r in rows]


def get_run(conn_factory: Callable, name: str, run_id: Optional[int] = None) -> Optional[Dict[str, Any]]:
    with conn_factory() as conn:
        if run_id is None:
            r = conn.execute(f"SELECT {_COLS} FROM screen_runs WHERE name=? ORDER BY run_at DESC, id DESC LIMIT 1",
                             (name,)).fetchone()
        else:
            r = conn.execute(f"SELECT {_COLS} FROM screen_runs WHERE name=? AND id=?", (name, run_id)).fetchone()
    return _row_to_run(r) if r else None


def list_runs(conn_factory: Callable, name: str) -> List[Dict[str, Any]]:
    with conn_factory() as conn:
        rows = conn.execute("""SELECT id, run_at, as_of, row_count FROM screen_runs WHERE name=?
                               ORDER BY run_at DESC, id DESC""", (name,)).fetchall()
    return [{"id": r[0], "run_at": r[1], "as_of": r[2], "row_count": r[3]} for r in rows]
