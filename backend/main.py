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

# Global background sync task status state
sync_state = {
    "is_running": False,
    "last_synced": None,
    "last_log": "Idle"
}


# --- Watchlist API Endpoints ---

@app.get("/api/watchlists")
def get_watchlists():
    """List all watchlist categories and their symbol counts."""
    categories = yaml_manager.list_watchlists()
    result = []
    for cat in categories:
        try:
            wdata = yaml_manager.get_watchlist(cat)
            tickers = wdata.get("tickers", [])
            result.append({
                "id": cat,
                "name": wdata.get("name", cat.replace("_", " ").title()),
                "symbol_count": len(tickers),
                "symbols": [t["symbol"] for t in tickers if isinstance(t, dict) and "symbol" in t]
            })
        except Exception as e:
            continue
    return result

@app.get("/api/watchlists/{category}")
def get_watchlist_detail(category: str):
    """Retrieve full detail for a specific watchlist category."""
    try:
        data = yaml_manager.get_watchlist(category)
        return {
            "id": category,
            "name": data.get("name", category.replace("_", " ").title()),
            "tickers": data.get("tickers", [])
        }
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Watchlist '{category}' not found.")

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
        # If target_entry or tags were specified, update them
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
    
    result = []
    for _, r in visible_df.iterrows():
        result.append({
            "time": r['date'],
            "timestamp": int(pd.to_datetime(r['date'] + "T00:00:00Z").timestamp()),
            "open": float(r['open']),
            "high": float(r['high']),
            "low": float(r['low']),
            "close": float(r['close']),
            "volume": int(r['volume']),
            "ema10": float(r['ema10']) if pd.notna(r['ema10']) else None,
            "sma50": float(r['sma50']) if pd.notna(r['sma50']) else None,
            "sma200": float(r['sma200']) if pd.notna(r['sma200']) else None,
            "atr14": float(r['atr14']) if pd.notna(r['atr14']) else None,
        })
    return result


# --- Analytics Endpoint ---

@app.get("/api/analytics/sector-momentum")
def get_sector_momentum(
    category: str = Query(..., description="Watchlist category name"),
    timeframe: str = Query("3m", description="3m or 1y")
):
    """Calculate Price-Weighted and Equal-Weighted Base 100 indices for a watchlist category."""
    try:
        wdata = yaml_manager.get_watchlist(category)
        tickers = [t["symbol"] for t in wdata.get("tickers", []) if isinstance(t, dict) and "symbol" in t]
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
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Watchlist category '{category}' not found.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- Data Pipeline Sync Endpoints ---

def run_sync_task():
    global sync_state
    sync_state["is_running"] = True
    sync_state["last_log"] = "Sync started..."
    try:
        data_fetcher.sync_tickers()
        sync_state["last_synced"] = datetime.now().isoformat()
        sync_state["last_log"] = "Sync completed successfully."
    except Exception as e:
        sync_state["last_log"] = f"Sync error: {str(e)}"
    finally:
        sync_state["is_running"] = False

@app.post("/api/sync")
def trigger_sync(background_tasks: BackgroundTasks):
    """Trigger background Alpaca EOD market data ingestion into SQLite."""
    global sync_state
    if sync_state["is_running"]:
        return {"status": "already_running", "message": "Market data sync is currently in progress."}
    
    background_tasks.add_task(run_sync_task)
    return {"status": "started", "message": "Market data sync task triggered."}

@app.get("/api/status")
def get_system_status():
    """Get system health, cache metrics, and market data sync state."""
    conn = database.get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(DISTINCT ticker), COUNT(*), MAX(date) FROM daily_prices")
    row = cursor.fetchone()
    conn.close()
    
    unique_tickers = row[0] if row else 0
    total_records = row[1] if row else 0
    max_date = row[2] if row else None

    return {
        "sync": sync_state,
        "database": {
            "path": database.DB_PATH,
            "unique_tickers": unique_tickers,
            "total_records": total_records,
            "latest_date": max_date
        }
    }

# --- Static File Serving for Production React SPA ---

DIST_DIR = os.path.join(WORKSPACE_ROOT, "FlipCharts", "dist")
if os.path.exists(DIST_DIR):
    from fastapi.staticfiles import StaticFiles
    app.mount("/", StaticFiles(directory=DIST_DIR, html=True), name="static")

