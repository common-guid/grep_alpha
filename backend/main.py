import os
import sys
import asyncio
from typing import List, Optional, Dict, Any
from fastapi import FastAPI, HTTPException, Query, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import pandas as pd
from datetime import datetime, timedelta

# Ensure workspace root and grep_alpha are in python path
WORKSPACE_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GREP_ALPHA_DIR = os.path.join(WORKSPACE_ROOT, "grep_alpha")
if WORKSPACE_ROOT not in sys.path:
    sys.path.insert(0, WORKSPACE_ROOT)
if GREP_ALPHA_DIR not in sys.path:
    sys.path.insert(0, GREP_ALPHA_DIR)

from grep_alpha.src.yaml_manager import YAMLManager
from grep_alpha.src import database, analytics, data_fetcher

from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    database.init_db()
    yield

app = FastAPI(
    title="Unified Watchlist Monitor & Charting API",
    version="1.0.0",
    description="API Gateway serving high-performance market data, sector momentum indices, and watchlist management.",
    lifespan=lifespan
)

# Enable CORS for local development (React Vite server running on port 3000 / 5173)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize watchlists manager targeting grep_alpha/watchlists
WATCHLISTS_DIR = os.path.join(GREP_ALPHA_DIR, "watchlists")
yaml_manager = YAMLManager(watchlists_dir=WATCHLISTS_DIR)


# --- Data Transfer Objects (Pydantic Models) ---

class TickerCreate(BaseModel):
    symbol: str = Field(..., json_schema_extra={"example": "AAPL"})
    thesis: Optional[str] = Field("", json_schema_extra={"example": "Breaking out of consolidation base"})
    status: Optional[str] = Field("watching", json_schema_extra={"example": "watching"})
    target_entry: Optional[float] = Field(None, json_schema_extra={"example": 185.50})
    tags: Optional[List[str]] = Field(default_factory=list, json_schema_extra={"example": ["Big_Tech", "AI"]})

class TickerUpdate(BaseModel):
    thesis: Optional[str] = None
    status: Optional[str] = None
    target_entry: Optional[float] = None
    tags: Optional[List[str]] = None

class SyncStatusResponse(BaseModel):
    is_running: bool
    message: str
    last_synced: Optional[str] = None

class DrawingPointIn(BaseModel):
    time: Any
    price: float

class DrawingIn(BaseModel):
    tool: str
    points: List[DrawingPointIn]
    color: str = "#58a6ff"

class DrawingSetIn(BaseModel):
    drawings: List[DrawingIn]

# Global background sync task status state
sync_state = {
    "is_running": False,
    "last_synced": None,
    "last_log": "Idle"
}


# --- Watchlist API Endpoints ---

# Path to master FlipCharts watchlist.yaml
FLIPCHARTS_WATCHLIST_PATH = os.path.join(WORKSPACE_ROOT, "FlipCharts", "watchlist.yaml")
FLIPCHARTS_DIST_WATCHLIST_PATH = os.path.join(WORKSPACE_ROOT, "FlipCharts", "dist", "watchlist.yaml")
BACKUPS_DIR = os.path.join(WORKSPACE_ROOT, "update_pipeline", ".backups")


def resolve_flipcharts_watchlist_path() -> Optional[str]:
    if os.path.exists(FLIPCHARTS_WATCHLIST_PATH):
        return FLIPCHARTS_WATCHLIST_PATH
    if os.path.exists(FLIPCHARTS_DIST_WATCHLIST_PATH):
        return FLIPCHARTS_DIST_WATCHLIST_PATH
    return None


def get_flipcharts_watchlist_items() -> List[Dict[str, Any]]:
    """Load and parse FlipCharts/watchlist.yaml into a list of ticker objects."""
    path = resolve_flipcharts_watchlist_path()
    if not path:
        return []
    try:
        import yaml
        with open(path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f) or []
            return data if isinstance(data, list) else []
    except Exception:
        return []


class WatchlistSavePayload(BaseModel):
    yaml: str
    items: Optional[List[Dict[str, Any]]] = None


@app.post("/api/watchlist/save")
def save_master_watchlist(payload: WatchlistSavePayload):
    """Persist master watchlist directly to FlipCharts/watchlist.yaml with a timestamped backup."""
    try:
        target_path = FLIPCHARTS_WATCHLIST_PATH
        os.makedirs(os.path.dirname(target_path), exist_ok=True)
        os.makedirs(BACKUPS_DIR, exist_ok=True)
        
        # Create timestamped backup if existing file exists
        existing_path = resolve_flipcharts_watchlist_path()
        if existing_path and os.path.exists(existing_path):
            timestamp = datetime.now().strftime("%Y-%m-%d_%H%M%S")
            backup_file = os.path.join(BACKUPS_DIR, f"watchlist_{timestamp}.yaml")
            try:
                import shutil
                shutil.copy2(existing_path, backup_file)
            except Exception:
                pass

        with open(target_path, "w", encoding="utf-8") as f:
            f.write(payload.yaml)

        # Also sync to dist if dist exists (e.g. running in Docker container)
        if os.path.exists(os.path.dirname(FLIPCHARTS_DIST_WATCHLIST_PATH)):
            try:
                with open(FLIPCHARTS_DIST_WATCHLIST_PATH, "w", encoding="utf-8") as f:
                    f.write(payload.yaml)
            except Exception:
                pass

        return {"status": "success", "message": "Watchlist saved successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/watchlists")
def get_watchlists():
    """List all watchlist categories (including tags from FlipCharts/watchlist.yaml) and their symbol counts."""
    categories = yaml_manager.list_watchlists()
    result = []
    seen_ids = set()

    for cat in categories:
        try:
            wdata = yaml_manager.get_watchlist(cat)
            tickers = wdata.get("tickers", [])
            seen_ids.add(cat.lower())
            result.append({
                "id": cat,
                "name": wdata.get("name", cat.replace("_", " ").title()),
                "symbol_count": len(tickers),
                "symbols": [t["symbol"] for t in tickers if isinstance(t, dict) and "symbol" in t]
            })
        except Exception:
            continue

    # Also include tag-based categories from FlipCharts/watchlist.yaml
    master_items = get_flipcharts_watchlist_items()
    tag_map: Dict[str, List[str]] = {}
    for item in master_items:
        sym = item.get("symbol", "")
        tags = item.get("tags") or []
        if isinstance(tags, str):
            tags = [t.strip() for t in tags.split(",") if t.strip()]
        elif not isinstance(tags, (list, tuple, set)):
            tags = []
        for t in tags:
            tag_key = t.strip().lower()
            if not tag_key:
                continue
            if tag_key not in tag_map:
                tag_map[tag_key] = []
            if sym and sym not in tag_map[tag_key]:
                tag_map[tag_key].append(sym)

    for tag_key, syms in tag_map.items():
        if tag_key not in seen_ids:
            seen_ids.add(tag_key)
            result.append({
                "id": tag_key,
                "name": tag_key.replace("_", " ").title(),
                "symbol_count": len(syms),
                "symbols": syms
            })

    return result


@app.get("/api/watchlists/{category}")
def get_watchlist_detail(category: str):
    """Retrieve full detail for a specific watchlist category or tag."""
    # 1. Try file-based categories in grep_alpha/watchlists/
    try:
        data = yaml_manager.get_watchlist(category)
        return {
            "id": category,
            "name": data.get("name", category.replace("_", " ").title()),
            "tickers": data.get("tickers", [])
        }
    except FileNotFoundError:
        pass

    # 2. Try tag matching from FlipCharts/watchlist.yaml
    master_items = get_flipcharts_watchlist_items()
    if category.lower() == "all":
        return {
            "id": "all",
            "name": "All Symbols",
            "tickers": master_items
        }

    target_tag = category.lower().replace("_", "").replace("-", "")
    matching_tickers = []
    for item in master_items:
        tags = item.get("tags") or []
        if isinstance(tags, str):
            tags = [t.strip() for t in tags.split(",") if t.strip()]
        elif not isinstance(tags, (list, tuple, set)):
            tags = []
        for t in tags:
            norm_tag = t.lower().replace("_", "").replace("-", "")
            if norm_tag == target_tag or t.lower() == category.lower():
                matching_tickers.append(item)
                break

    if matching_tickers:
        return {
            "id": category,
            "name": category.replace("_", " ").title(),
            "tickers": matching_tickers
        }

    return {
        "id": category,
        "name": category.replace("_", " ").title(),
        "tickers": []
    }


@app.post("/api/watchlists/{category}/tickers")
def add_ticker(category: str, item: TickerCreate):
    """Add a new ticker to a watchlist category."""
    try:
        yaml_manager.add_ticker(
            category=category,
            ticker=item.symbol,
            thesis=item.thesis or "",
            status=item.status or "watching"
        )
        if item.target_entry is not None or item.tags:
            wdata = yaml_manager.get_watchlist(category)
            for t in wdata.get("tickers", []):
                if t.get("symbol", "").upper() == item.symbol.upper():
                    if item.target_entry is not None:
                        t["target_entry"] = item.target_entry
                    if item.tags:
                        t["tags"] = item.tags
                    break
            yaml_manager.save_watchlist(category, wdata)
        return {"message": f"Successfully added {item.symbol.upper()} to {category}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/watchlists/{category}/tickers/{symbol}")
def remove_ticker(category: str, symbol: str):
    """Remove a ticker from a watchlist category."""
    try:
        yaml_manager.remove_ticker(category, symbol)
        return {"message": f"Removed {symbol.upper()} from {category}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.patch("/api/watchlists/{category}/tickers/{symbol}")
def update_ticker(category: str, symbol: str, item: TickerUpdate):
    """Update thesis, status, target_entry, or tags for a ticker in a watchlist."""
    try:
        wdata = yaml_manager.get_watchlist(category)
        updated = False
        for t in wdata.get("tickers", []):
            if t.get("symbol", "").upper() == symbol.upper():
                if item.thesis is not None:
                    t["thesis"] = item.thesis
                if item.status is not None:
                    t["status"] = item.status
                if item.target_entry is not None:
                    t["target_entry"] = item.target_entry
                if item.tags is not None:
                    t["tags"] = item.tags
                updated = True
                break
        if not updated:
            raise HTTPException(status_code=404, detail=f"Ticker '{symbol}' not found in watchlist '{category}'")
        yaml_manager.save_watchlist(category, wdata)
        return {"message": f"Updated metadata for {symbol.upper()}"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



# --- Market Data & Indicators Endpoint ---

@app.get("/api/prices")
def get_prices(
    symbol: str = Query(..., description="Ticker symbol, e.g., AAPL"),
    timeframe: str = Query("3M", description="1D, 1W, 3M, 6M, 1Y")
):
    """Fetch daily candlestick prices with calculated 10 EMA, 50 SMA, 200 SMA, and 14 ATR."""
    tf_days_map = {
        "1D": 1,
        "1W": 7,
        "3M": 90,
        "6M": 180,
        "1Y": 365
    }
    days = tf_days_map.get(timeframe.upper(), 90)
    today = datetime.now().date()
    visible_start = today - timedelta(days=days)
    
    # Warmup start date (350 days back) to accurately calculate 200 SMA & ATR (14)
    warmup_start = today - timedelta(days=days + 350)
    
    rows = database.get_price_data(symbol, warmup_start.isoformat())
    if not rows:
        try:
            print(f"[ON-DEMAND] Fetching missing market data for {symbol} via yfinance...")
            start_date = today - timedelta(days=days + 350)
            end_date = today - timedelta(days=1)
            new_data = data_fetcher.fetch_ticker_data_yfinance(symbol, start_date, end_date)
            if new_data:
                database.insert_daily_prices(new_data)
                rows = database.get_price_data(symbol, warmup_start.isoformat())
        except Exception as fetch_err:
            print(f"[ON-DEMAND ERROR] Failed fetching {symbol}: {fetch_err}")

    if not rows:
        return []
    
    df = pd.DataFrame(rows, columns=['date', 'open', 'high', 'low', 'close', 'volume'])
    df['date_dt'] = pd.to_datetime(df['date'])
    
    # Calculate indicators
    df['atr14'] = analytics.calculate_atr(df, period=14)
    df['ema10'] = df['close'].ewm(span=10, adjust=False).mean()
    df['sma50'] = df['close'].rolling(window=50).mean()
    df['sma200'] = df['close'].rolling(window=200).mean()
    
    # Filter to visible window
    visible_mask = df['date_dt'] >= pd.to_datetime(visible_start.isoformat())
    visible_df = df[visible_mask].copy()
    
    if visible_df.empty:
        # Fallback if no visible data in window
        visible_df = df.tail(days)
    
    return _price_records(visible_df)


def _nn(x):
    """Convert NaN to None; otherwise float."""
    return None if x != x else float(x)


def _price_records(vdf: pd.DataFrame):
    """Build /api/prices rows without iterrows or per-row to_datetime."""
    if vdf.empty:
        return []
    dates = vdf['date'].tolist()
    ts = (
        (pd.to_datetime(vdf['date'], format='%Y-%m-%d', utc=True)
         - pd.Timestamp('1970-01-01', tz='UTC'))
        // pd.Timedelta('1s')
    ).tolist()
    opens = vdf['open'].tolist()
    highs = vdf['high'].tolist()
    lows = vdf['low'].tolist()
    closes = vdf['close'].tolist()
    volumes = vdf['volume'].tolist()
    ema10s = vdf['ema10'].tolist()
    sma50s = vdf['sma50'].tolist()
    sma200s = vdf['sma200'].tolist()
    atr14s = vdf['atr14'].tolist()
    result = []
    for d, t, o, h, l, c, v, e, s50, s200, a in zip(
        dates, ts, opens, highs, lows, closes, volumes, ema10s, sma50s, sma200s, atr14s
    ):
        result.append({
            "time": d,
            "timestamp": int(t),
            "open": float(o),
            "high": float(h),
            "low": float(l),
            "close": float(c),
            "volume": int(v),
            "ema10": _nn(e),
            "sma50": _nn(s50),
            "sma200": _nn(s200),
            "atr14": _nn(a),
        })
    return result


# --- Chart Drawings API Endpoints ---

ALLOWED_DRAWING_TOOLS = {"trendline", "ray", "hline", "vline", "rect", "measure"}
EXPECTED_ANCHOR_COUNTS = {
    "trendline": 2,
    "ray": 2,
    "rect": 2,
    "measure": 2,
    "hline": 1,
    "vline": 1,
}

@app.get("/api/drawings/{symbol}")
def get_drawings(symbol: str):
    """Retrieve all stored chart drawings for a given symbol."""
    sym = symbol.strip().upper()
    database.init_db()
    with database.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, symbol, tool, points, color, created_at, updated_at FROM chart_drawings WHERE symbol = ? ORDER BY id ASC",
            (sym,)
        )
        rows = cursor.fetchall()

    import json
    result = []
    for row in rows:
        d_id, d_sym, d_tool, d_points_str, d_color, c_at, u_at = row
        try:
            points = json.loads(d_points_str)
        except Exception:
            points = []
        result.append({
            "id": d_id,
            "symbol": d_sym,
            "tool": d_tool,
            "points": points,
            "color": d_color,
            "created_at": c_at,
            "updated_at": u_at
        })
    return {"drawings": result}


@app.put("/api/drawings/{symbol}")
def save_drawings(symbol: str, payload: DrawingSetIn):
    """Replace all drawings for a symbol with the provided set."""
    sym = symbol.strip().upper()
    import json

    # Validation
    for d in payload.drawings:
        if d.tool not in ALLOWED_DRAWING_TOOLS:
            raise HTTPException(status_code=400, detail=f"Invalid tool '{d.tool}'. Allowed tools: {sorted(ALLOWED_DRAWING_TOOLS)}")
        expected_cnt = EXPECTED_ANCHOR_COUNTS[d.tool]
        if len(d.points) != expected_cnt:
            raise HTTPException(status_code=400, detail=f"Tool '{d.tool}' requires {expected_cnt} anchor point(s), got {len(d.points)}")

    database.init_db()
    with database.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM chart_drawings WHERE symbol = ?", (sym,))
        for d in payload.drawings:
            points_json = json.dumps([pt.model_dump() for pt in d.points])
            cursor.execute(
                """
                INSERT INTO chart_drawings (symbol, tool, points, color, created_at, updated_at)
                VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
                """,
                (sym, d.tool, points_json, d.color)
            )
        conn.commit()

    return get_drawings(sym)


@app.delete("/api/drawings/{symbol}/{drawing_id}")
def delete_drawing(symbol: str, drawing_id: int):
    """Delete a specific drawing by ID for a symbol."""
    sym = symbol.strip().upper()
    database.init_db()
    with database.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM chart_drawings WHERE symbol = ? AND id = ?", (sym, drawing_id))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail=f"Drawing {drawing_id} for symbol {sym} not found")
        cursor.execute("DELETE FROM chart_drawings WHERE symbol = ? AND id = ?", (sym, drawing_id))
        conn.commit()
    return {"ok": True}


# --- Analytics Endpoint ---

@app.get("/api/analytics/sector-momentum")
def get_sector_momentum(
    category: str = Query(..., description="Watchlist category name"),
    timeframe: str = Query("3m", description="3m or 1y")
):
    """Calculate Price-Weighted and Equal-Weighted Base 100 indices for a watchlist category."""
    try:
        tickers = []
        try:
            wdata = yaml_manager.get_watchlist(category)
            tickers = [t["symbol"] for t in wdata.get("tickers", []) if isinstance(t, dict) and "symbol" in t]
        except FileNotFoundError:
            # Fallback to tag lookup in master watchlist.yaml
            master_items = get_flipcharts_watchlist_items()
            if category.lower() == "all":
                tickers = [item.get("symbol") for item in master_items if item.get("symbol")]
            else:
                target_tag = category.lower().replace("_", "").replace("-", "")
                for item in master_items:
                    sym = item.get("symbol")
                    tags = item.get("tags") or []
                    if isinstance(tags, str):
                        tags = [t.strip() for t in tags.split(",") if t.strip()]
                    elif not isinstance(tags, (list, tuple, set)):
                        tags = []
                    for t in tags:
                        norm_tag = t.lower().replace("_", "").replace("-", "")
                        if norm_tag == target_tag or t.lower() == category.lower():
                            if sym:
                                tickers.append(sym)
                            break

        if not tickers:
            return {"date": [], "price_weighted": [], "equal_weighted": []}
        
        idx_df = analytics.calculate_indices(tickers, timeframe=timeframe.lower())
        if idx_df.empty:
            return {"date": [], "price_weighted": [], "equal_weighted": []}
        
        return {
            "date": idx_df.index.tolist(),
            "price_weighted": idx_df['Price-Weighted'].round(2).tolist(),
            "equal_weighted": idx_df['Equal-Weighted'].round(2).tolist()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



# --- Data Pipeline Sync Endpoints ---

def run_sync_task(force: bool = False):
    global sync_state
    sync_state["is_running"] = True
    sync_state["last_log"] = "Sync started..."
    try:
        res = data_fetcher.sync_tickers(force=force)
        sync_state["last_synced"] = datetime.now().isoformat()
        if isinstance(res, dict) and res.get("status") == "cooldown_active":
            sync_state["last_log"] = f"Sync paused: {res.get('message')}"
        elif isinstance(res, dict) and res.get("status") == "rate_limit_tripped":
            sync_state["last_log"] = f"Circuit breaker tripped: {res.get('message')}"
        else:
            sync_state["last_log"] = "Sync completed successfully."
    except Exception as e:
        sync_state["last_log"] = f"Sync error: {str(e)}"
    finally:
        sync_state["is_running"] = False

@app.post("/api/sync")
def trigger_sync(background_tasks: BackgroundTasks, force: bool = Query(False, description="Bypass active 24-hour rate limit cooldown")):
    """Trigger background yfinance EOD market data ingestion into SQLite."""
    global sync_state
    if sync_state["is_running"]:
        return {"status": "already_running", "message": "Market data sync is currently in progress."}
    
    cooldown = database.get_rate_limit_cooldown_status()
    if cooldown["active"] and not force:
        return {
            "status": "cooldown_active",
            "message": f"Market data sync is paused due to an active 24-hour rate limit cooldown until {cooldown['locked_until']}.",
            "cooldown": cooldown
        }
    
    background_tasks.add_task(run_sync_task, force=force)
    return {"status": "started", "message": "Market data sync task triggered."}

@app.get("/api/status")
def get_system_status():
    """Get system health, cache metrics, market data sync state, and 24-hour rate limit cooldown lock."""
    database.init_db()
    conn = database.get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(DISTINCT ticker), COUNT(*), MAX(date) FROM daily_prices")
    row = cursor.fetchone()
    conn.close()
    
    unique_tickers = row[0] if row else 0
    total_records = row[1] if row else 0
    max_date = row[2] if row else None

    cooldown = database.get_rate_limit_cooldown_status()

    return {
        "sync": sync_state,
        "cooldown": cooldown,
        "database": {
            "path": database.DB_PATH,
            "unique_tickers": unique_tickers,
            "total_records": total_records,
            "latest_date": max_date
        }
    }


# --- Live watchlist.yaml serving (MUST be registered before the dist static mount) ---
# The SPA fetches /watchlist.yaml for its tag sidebar and ticker list. Serving the
# build-time dist copy here made external watchlist changes (pipeline merges,
# migrations) invisible until an image rebuild. Serve the live master file instead;
# fall back to the dist copy only if the master file is missing (read-only images).

@app.get("/watchlist.yaml", include_in_schema=False)
def get_live_watchlist_yaml():
    from fastapi.responses import PlainTextResponse
    path = FLIPCHARTS_WATCHLIST_PATH if os.path.exists(FLIPCHARTS_WATCHLIST_PATH) else (
        FLIPCHARTS_DIST_WATCHLIST_PATH if os.path.exists(FLIPCHARTS_DIST_WATCHLIST_PATH) else None
    )
    if not path:
        raise HTTPException(status_code=404, detail="watchlist.yaml not found")
    with open(path, "r", encoding="utf-8") as f:
        return PlainTextResponse(f.read(), media_type="text/yaml")


# --- Static File Serving for Production React SPA ---

DIST_DIR = os.path.join(WORKSPACE_ROOT, "FlipCharts", "dist")
if os.path.exists(DIST_DIR):
    from fastapi.staticfiles import StaticFiles
    app.mount("/", StaticFiles(directory=DIST_DIR, html=True), name="static")

