# Screens API (JSON v1)

An external screener, such as Grep Alpha Trader, **hands results to the app**. The app stores them and filters the FlipCharts grid to a screen's hits. **The app never runs screens.** Anything that returns a list of tickers works: badges and sorts are built from the payload's `columns`, so nothing is specific to one screen.

Prod is LAN-only and single-user, so there is no auth token. Don't expose the backend publicly.

## Endpoints
| Method | Path | Notes |
|---|---|---|
| `POST` | `/api/screens` | Store one run. **201** stored, **200** replaced (same `screen` and `run_at`), **422** validation errors (`{"status":"error","errors":[...]}`), **400** not JSON, **413** body over 1 MB |
| `GET` | `/api/screens` | `{"screens":[{"screen","runs","latest":{"id","run_at","as_of","row_count","source"}}]}` |
| `GET` | `/api/screens/{name}/latest` | Full run. Each row gets `on_watchlist` |
| `GET` | `/api/screens/{name}/runs` | `{"runs":[{"id","run_at","as_of","row_count"}]}`, newest first |
| `GET` | `/api/screens/{name}/{id}` | One specific run |

The GETs are read-only.

**Retention:** each screen keeps its **last 30 runs** (by `run_at`). Older runs are pruned when a new one is posted.

**Storage:** the app DB's `screen_runs` table, created by `database.init_db()` at startup.

The 201/200 response is `{"status":"ok","id","screen","run_at","as_of","row_count","replaced","pruned","off_watchlist":[...]}`.

## Payload v1
| Field | Type | Rules |
|---|---|---|
| `screen` | string | `^[a-z0-9][a-z0-9_.-]{0,63}$`, lowercase. One name per screen definition (`lr10`, `lr10_r2_0.7`) |
| `version` | int | `1` |
| `run_at` | string | ISO 8601 **with timezone**, stored as UTC `Z` |
| `as_of` | string | `YYYY-MM-DD`, the last bar date used. Drives the stale warning |
| `source` | string | Optional, ≤100 chars (e.g. `grep-alpha-trader`) |
| `params` | object | Optional, free-form. Include the **criteria** spelled out, including any R² cutoff (or "none") |
| `universe` | object | Optional, free-form, e.g. `{"source","count","computed","missing"}` |
| `columns` | array, 1-8 | `{"key","label","fmt"}`. `key` is snake_case and not `ticker`/`rank`. `label` is 1-24 chars and shown on cards. `fmt` is one of `f0`-`f4` (fixed decimals), `pct0`-`pct4` (value already in %, shown with sign), `fracpct0`-`fracpct4` (a fraction such as 0.05, shown as +5.0%), `usd`, `int`, `text` |
| `rows` | array, 0-1000 | `{"ticker","rank",...}`. `ticker` is `^[A-Z][A-Z0-9.-]{0,9}$` (uppercased on input) and unique. `rank` is an integer ≥1, unique, 1 = best. Values for numeric columns must be finite numbers or `null`. Extra keys (numbers or strings) are kept |

Sample: [examples/screen-lr10-sample.json](examples/screen-lr10-sample.json).

## In the app
- **Picking a screen:** Flip-Charts toolbar, or Filter & sort in the mobile drawer. Choosing **Screen** shows its latest run; the URL becomes `?screen=<name>`, which is also remembered in localStorage.
- **Filter order:** tag → date added → Held → **screen** → sort.
- **Sorts:** **Screen rank**, plus **Screen: <label> (high–low)** for every non-text column.
- **Card badge:** `#rank` plus the first three columns, e.g. `#1 · Slope %/d +4.57% · R² 0.94`.
- **Chip:** `name · as_of · count`.
- **Stale notice:** an amber notice appears when `as_of` is before the latest completed trading day. That is 16:30 ET on weekdays, skipping NYSE holidays for 2026-27.
- **Off-watchlist hits:** tickers not in `watchlist.yaml` show only on **All Symbols**, and only with no date filter and Held off. They are marked **off-watchlist** and are **never added** to the watchlist.

## Converting a screener CSV
`tools/screen_csv_to_v1.py` turns any CSV with a `ticker` column into a v1 payload. Rows are ranked in file order, or by `--rank-by [-]col`.
```bash
python tools/screen_csv_to_v1.py reports/screens/lr10_2026-10-15.csv \
  --screen lr10 --source grep-alpha-trader \
  --column 'slope_pct_per_day:Slope %/d:pct2' --column 'r2:R²:f2' --column 'slope_usd_per_day:$/d:f2' \
  --param window=10 --param field=close --param adjustment=split --param feed=sip \
  --param 'criteria=slope_usd_per_day > 0 (no R² cutoff)' --param 'sort=-slope_pct_per_day' \
  --universe-source 'research prices.db' --universe-count 292 --check > lr10.json
curl -s -X POST -H 'Content-Type: application/json' --data-binary @lr10.json http://<backend>/api/screens
```
`as_of` defaults to the CSV's latest `window_end`/`as_of`. `run_at` defaults to now (UTC). `--check` validates with the backend's own validator, so it needs the repo on `PYTHONPATH`.

## Producer checklist (Grep Alpha Trader)
1. Send one POST per run after it finishes. Re-posting the same `run_at` replaces that run, so retries are safe.
2. On a 422, fix the payload (the `errors` list says what's wrong). On a 5xx or a network error, retry later.
3. Never write the prod DB or `watchlist.yaml` directly.
