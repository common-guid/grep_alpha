import os
from datetime import datetime, timedelta
from typing import List, Set
try:
    from alpaca_trade_api.rest import REST, TimeFrame
except ImportError:
    REST = None
    TimeFrame = None

# Load environment variables (assumes they are set in the environment)
APCA_API_KEY_ID = os.getenv("APCA_API_KEY_ID")
APCA_API_SECRET_KEY = os.getenv("APCA_API_SECRET_KEY")
APCA_API_BASE_URL = os.getenv("APCA_API_BASE_URL", "https://paper-api.alpaca.markets")

def get_alpaca_client():
    if REST is None:
        raise ImportError("alpaca_trade_api library is not installed.")
    if not APCA_API_KEY_ID or not APCA_API_SECRET_KEY:
        raise ValueError("Alpaca API credentials not found in environment variables.")
    return REST(APCA_API_KEY_ID, APCA_API_SECRET_KEY, base_url=APCA_API_BASE_URL)

def get_unique_tickers() -> Set[str]:
    """Get the master list of all unique tickers across all YAML watchlists."""
    manager = YAMLManager()
    categories = manager.list_watchlists()
    all_tickers = set()
    for cat in categories:
        watchlist = manager.get_watchlist(cat)
        for entry in watchlist.get("tickers", []):
            all_tickers.add(entry["symbol"].upper())
    return all_tickers

import time
try:
    from src import database
    from src.yaml_manager import YAMLManager
except ImportError:
    from grep_alpha.src import database
    from grep_alpha.src.yaml_manager import YAMLManager


def sync_tickers(force: bool = False) -> dict:
    """Sync missing daily data from Alpaca to the local SQLite database.
    Enforces a persistent 24-hour rate-limit circuit breaker cooldown if 429 is encountered.
    """
    database.init_db()
    
    # Check 24-hour rate limit cooldown lock
    cooldown = database.get_rate_limit_cooldown_status()
    if cooldown["active"] and not force:
        msg = f"[PAUSED] API rate-limit cooldown active until {cooldown['locked_until']} ({cooldown['remaining_hours']}h remaining). Sync skipped."
        print(msg)
        return {"status": "cooldown_active", "message": msg, "cooldown": cooldown}

    if force and cooldown["active"]:
        print("[FORCE] Bypassing active rate limit cooldown lock...")
        database.clear_rate_limit_cooldown()

    tickers = get_unique_tickers()
    if not tickers:
        print("No tickers found in watchlists.")
        return {"status": "success", "synced": 0}

    api = get_alpaca_client()
    today = datetime.now().date()
    end_date = today - timedelta(days=2) 
    
    synced_count = 0
    failed_tickers = []
    
    for ticker in tickers:
        last_date_str = database.get_last_updated_date(ticker)
        
        if last_date_str:
            start_date = datetime.strptime(last_date_str, "%Y-%m-%d").date() + timedelta(days=1)
        else:
            start_date = today - timedelta(days=365)
        
        if start_date > end_date:
            print(f"Ticker {ticker} is already up to date (last date: {last_date_str or 'N/A'}).")
            continue

        print(f"Fetching data for {ticker} from {start_date} to {end_date}...")
        
        try:
            # Respect API limits with a small inter-request delay
            time.sleep(0.3)
            
            bars = api.get_bars(
                ticker, 
                TimeFrame.Day, 
                start=start_date.isoformat(), 
                end=end_date.isoformat(), 
                adjustment='all',
                feed='iex'
            ).df
            
            if bars.empty:
                print(f"No new data found for {ticker}.")
                continue
            
            db_data = []
            for timestamp, row in bars.iterrows():
                date_str = timestamp.date().isoformat()
                db_data.append((
                    date_str,
                    ticker,
                    float(row['open']),
                    float(row['high']),
                    float(row['low']),
                    float(row['close']),
                    int(row['volume'])
                ))
            
            database.insert_daily_prices(db_data)
            synced_count += 1
            print(f"Inserted {len(db_data)} records for {ticker}.")
            
        except Exception as e:
            err_msg = str(e).lower()
            if "429" in err_msg or "too many requests" in err_msg or "rate limit" in err_msg:
                reason_str = f"Rate limit tripped on {ticker}: {str(e)}"
                locked_until = database.set_rate_limit_cooldown(hours=24.0, reason=reason_str)
                msg = f"[CIRCUIT BREAKER] Hit API rate limit on {ticker}! 24-hour cooldown activated until {locked_until}. Terminating sync loop."
                print(msg)
                return {
                    "status": "rate_limit_tripped",
                    "message": msg,
                    "ticker": ticker,
                    "locked_until": locked_until
                }
            else:
                print(f"Error fetching data for {ticker}: {e}")
                failed_tickers.append({"ticker": ticker, "error": str(e)})

    return {
        "status": "success",
        "synced": synced_count,
        "failed_tickers": failed_tickers
    }

if __name__ == "__main__":
    try:
        sync_tickers()
    except Exception as e:
        print(f"Sync failed: {e}")

