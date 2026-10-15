# Paper positions API (for Grep Alpha Trader and the FlipCharts app)

The backend reads the **Alpaca paper** account and never trades. The host is hard-coded to
`https://paper-api.alpaca.markets`; the only upstream call is `GET /v2/positions`.

## Configuration (backend environment only)
| Variable | Purpose |
|---|---|
| `ALPACA_PAPER_KEY_ID` | Paper key id (must start with `PK`, otherwise refused) |
| `ALPACA_PAPER_SECRET_KEY` | Paper secret |
| `GA_STATE_DIR` (optional) | Where `paper_autoadds.json` / `paper_autoadd.log` live. Default: the directory of `DB_PATH` (prod: the `app_data` volume, `/app/data`), else `.ga_state/` in the repo |

These are separate from `APCA_API_KEY_ID`/`APCA_API_SECRET_KEY`, which are used for market-data sync. Never put them in a `VITE_` variable: those ship to the browser.

## `GET /api/positions`: read-only, no side effects
Cached for 60s server-side. It always returns HTTP 200; check `status`.
```json
{
  "status": "ok",            // ok | unconfigured | error
  "fetched_at": "2026-10-15T20:13:13Z",   // UTC, of the snapshot
  "stale": false,            // true = Alpaca failed; this is the last good snapshot
  "error": null,             // human-readable reason when not ok / stale; never contains keys
  "positions": [
    {"symbol": "NVDA", "side": "long", "qty": 10, "avg_entry_price": 120.5,
     "current_price": 131.2, "market_value": 1312, "unrealized_pl": 107,
     "unrealized_plpc": 0.0888, "on_watchlist": true}
  ]
}
```
- `qty` is always positive; `side` is `long` or `short`.
- `unrealized_plpc` is a fraction (0.0888 = +8.88%).

## `POST /api/positions/sync-watchlist`: add held symbols to the watchlist
**Grep Alpha Trader calls this after each new position opens.** The app also calls it on its own when it sees a held symbol that is missing from the watchlist.

- **No request body.**
- **Fresh read:** it re-reads positions, bypassing a cache older than 5s, so a fill that just happened is seen.
- **Idempotent:** calling it any number of times is safe.
- **Adds:** every held symbol missing from `FlipCharts/watchlist.yaml` is appended as `status: watching`, `tags: paper`, `date`/`added` = today, empty thesis. A backup goes to `update_pipeline/.backups/`.
- **Never** modifies existing entries, and never removes anything when a position closes. To clean up, delete the symbol in the Watchlist Manager after closing the position.

Responses:
```json
// 200
{"status": "ok", "added": ["ORCL"], "already_on_watchlist": ["NVDA"], "restored": [],
 "held": ["NVDA", "ORCL"], "fetched_at": "2026-10-15T20:12:17Z", "error": null}
// 503: positions unavailable, nothing written
{"status": "unconfigured" | "error" | "unavailable", "added": [], ..., "error": "reason"}
```
- `unavailable` means only a stale snapshot exists.
- **Trader bot handling:**
  - On 503, retry later. Not adding to the watchlist must not block trading.
  - Log the `added` list in the trade journal entry.

Example: `curl -s -X POST http://<backend>/api/positions/sync-watchlist`

## Persistence across deploys and refreshes
- **Why it's needed:** prod's `FlipCharts/watchlist.yaml` is the repo checkout's file, bind-mounted into the container and also baked into the image. A deploy (`git pull` + rebuild) or a merged weekly refresh therefore replaces it with master's copy.
- **The record:** every auto-add is also recorded in `paper_autoadds.json` in the state dir.
- **When the backend re-merges it:** missing recorded symbols are re-appended, keeping their original `added` date:
  - at startup;
  - within about 15s of any change to the YAML (a watcher thread);
  - after every Watchlist Manager save.
- **Removals:** a symbol removed in the Watchlist Manager stays removed only if it is no longer held. If it is still held, it comes back.
