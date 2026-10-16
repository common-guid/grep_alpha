#!/usr/bin/env python3
"""Convert a screener CSV into a screens JSON v1 payload (docs/screens-api.md).

Generic: any CSV with a `ticker` column works. Rows are ranked in file order
(rank 1 = first row) unless --rank-by is given. Numeric-looking values become
numbers. Columns shown on chart cards are chosen with --column key:label:fmt.

Example (Grep Alpha Trader's 10-day linear-regression screen):
  python tools/screen_csv_to_v1.py reports/screens/lr10_2026-10-15.csv \\
      --screen lr10 --source grep-alpha-trader \\
      --column 'slope_pct_per_day:Slope %/d:pct2' --column 'r2:R²:f2' \\
      --column 'slope_usd_per_day:$/d:f2' \\
      --param window=10 --param field=close --param adjustment=split --param feed=sip \\
      --param 'criteria=slope_usd_per_day > 0 (no R² cutoff)' --param 'sort=-slope_pct_per_day' \\
      --universe-source 'research prices.db' --universe-count 292 > lr10.json
  curl -s -X POST -H 'Content-Type: application/json' --data-binary @lr10.json http://<host>/api/screens

Validate without posting: add --check (needs the repo on PYTHONPATH).
"""
import argparse
import csv
import json
import sys
from datetime import datetime, timezone


def num(v: str):
    if v is None:
        return None
    v = v.strip()
    if v == "":
        return None
    try:
        f = float(v)
        return int(f) if f.is_integer() and "." not in v and "e" not in v.lower() else f
    except ValueError:
        return v


def parse_kv(items):
    out = {}
    for it in items or []:
        k, _, v = it.partition("=")
        out[k.strip()] = num(v) if isinstance(num(v), (int, float)) else v
    return out


def build(args) -> dict:
    with open(args.csv, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    if rows and "ticker" not in rows[0]:
        sys.exit("CSV needs a 'ticker' column")
    out_rows = []
    for r in rows:
        row = {k: num(v) for k, v in r.items() if k and k != "ticker"}
        row["ticker"] = r["ticker"].strip().upper()
        out_rows.append(row)
    if args.rank_by:
        key, desc = args.rank_by.lstrip("-"), args.rank_by.startswith("-")
        out_rows.sort(key=lambda r: (r.get(key) is None, -(r.get(key) or 0) if desc else (r.get(key) or 0)))
    for i, r in enumerate(out_rows, 1):
        r["rank"] = i
    as_of = args.as_of or max((str(r.get("window_end") or r.get("as_of") or "") for r in out_rows), default="")
    if not as_of:
        sys.exit("--as-of required (no window_end/as_of column)")
    cols = []
    for c in args.column or []:
        parts = c.split(":")
        key = parts[0]
        cols.append({"key": key, "label": parts[1] if len(parts) > 1 else key, "fmt": parts[2] if len(parts) > 2 else "f2"})
    if not cols:
        sys.exit("at least one --column key:label:fmt is required")
    universe = {}
    if args.universe_source:
        universe["source"] = args.universe_source
    if args.universe_count is not None:
        universe["count"] = args.universe_count
    return {
        "screen": args.screen, "version": 1,
        "run_at": args.run_at or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "as_of": as_of, "source": args.source or "", "params": parse_kv(args.param),
        "universe": universe, "columns": cols, "rows": out_rows,
    }


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("csv")
    ap.add_argument("--screen", required=True)
    ap.add_argument("--column", action="append", help="key:label:fmt (fmt: f0-f4, pct0-pct4, fracpct0-4, usd, int, text)")
    ap.add_argument("--param", action="append", help="k=v, repeatable")
    ap.add_argument("--as-of", dest="as_of")
    ap.add_argument("--run-at", dest="run_at")
    ap.add_argument("--rank-by", dest="rank_by", help="column to rank by; prefix - for descending")
    ap.add_argument("--source")
    ap.add_argument("--universe-source", dest="universe_source")
    ap.add_argument("--universe-count", dest="universe_count", type=int)
    ap.add_argument("--check", action="store_true", help="validate with grep_alpha.src.screens")
    args = ap.parse_args(argv)
    payload = build(args)
    if args.check:
        from grep_alpha.src.screens import validate_payload
        validate_payload(payload)
        print(f"valid: {payload['screen']} as_of {payload['as_of']} rows {len(payload['rows'])}", file=sys.stderr)
    json.dump(payload, sys.stdout, ensure_ascii=False, indent=1)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
