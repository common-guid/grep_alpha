import os
import time
from datetime import datetime, timedelta
from typing import List, Set, Optional

try:
    import yfinance as yf
except ImportError:
    yf = None

try:
    from alpaca_trade_api.rest import REST, TimeFrame
except ImportError:
    REST = None
    TimeFrame = None

# Load environment variables
DATA_PROVIDER = os.getenv("DATA_PROVIDER", "yfinance").lower()
APCA_API_KEY_ID = os.getenv("APCA_API_KEY_ID")
APCA_API_SECRET_KEY = os.getenv("APCA_API_SECRET_KEY")
APCA_API_BASE_URL = os.getenv("APCA_API_BASE_URL", "https://paper-api.alpaca.markets")

try:
    from src import database
    from src.yaml_manager import YAMLManager
except ImportError:
    from grep_alpha.src import database
    from grep_alpha.src.yaml_manager import YAMLManager


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


def fetch_ticker_data_yfinance(ticker: str, start_date, end_date) -> List[tuple]:
    """Fetch daily OHLCV bars using yfinance (no API key required, auto-adjusted)."""
    if yf is None:
        raise ImportError("yfinance library is not installed. Run 'pip install yfinance'")
    
    ticker_obj = yf.Ticker(ticker)
    # yfinance end date is exclusive, so add 1 day to include end_date
    df = ticker_obj.history(
        start=start_date.isoformat(),
        end=(end_date + timedelta(days=1)).isoformat(),
        auto_adjust=True
    )
    
    if df.empty:
        return []
    
    db_data = []
    for timestamp, row in df.iterrows():
        date_str = timestamp.date().isoformat()
        db_data.append((
            date_str,
            ticker.upper(),
            float(row['Open']),
            float(row['High']),
            float(row['Low']),
            float(row['Close']),
            int(row['Volume'])
        ))
    return db_data


def fetch_ticker_data_alpaca(ticker: str, start_date, end_date, api=None) -> List[tuple]:
    """Fetch daily OHLCV bars using Alpaca API."""
    if api is None:
        api = get_alpaca_client()
    
    bars = api.get_bars(
        ticker,
        TimeFrame.Day,
        start=start_date.isoformat(),
        end=end_date.isoformat(),
        adjustment='all',
        feed='iex'
    ).df
    
    if bars.empty:
        return []
    
    db_data = []
    for timestamp, row in bars.iterrows():
        date_str = timestamp.date().isoformat()
        db_data.append((
            date_str,
            ticker.upper(),
            float(row['open']),
            float(row['high']),
            float(row['low']),
            float(row['close']),
            int(row['volume'])
        ))
    return db_data


def sync_tickers(force: bool = False, provider: Optional[str] = None) -> dict:
    """Sync missing daily data to the local SQLite database.
    Defaults to yfinance (no API key required), but supports provider='alpaca' if configured.
    Enforces a persistent 24-hour rate-limit circuit breaker cooldown if rate limited.
    """
    database.init_db()
    
    active_provider = (provider or os.getenv("DATA_PROVIDER", "yfinance")).lower()
    
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

    today = datetime.now().date()
    end_date = today - timedelta(days=1)
    
    synced_count = 0
    failed_tickers = []
    
    alpaca_api = None
    if active_provider == "alpaca":
        alpaca_api = get_alpaca_client()

    for ticker in tickers:
        last_date_str = database.get_last_updated_date(ticker)
        
        if last_date_str:
            start_date = datetime.strptime(last_date_str, "%Y-%m-%d").date() + timedelta(days=1)
        else:
            start_date = today - timedelta(days=365)
        
        if start_date > end_date:
            print(f"Ticker {ticker} is already up to date (last date: {last_date_str or 'N/A'}).")
            continue

        print(f"[{active_provider.upper()}] Fetching data for {ticker} from {start_date} to {end_date}...")
        
        try:
            time.sleep(0.2)
            
            if active_provider == "alpaca":
                db_data = fetch_ticker_data_alpaca(ticker, start_date, end_date, api=alpaca_api)
            else:
                db_data = fetch_ticker_data_yfinance(ticker, start_date, end_date)
            
            if not db_data:
                print(f"No new data found for {ticker}.")
                continue
            
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
        "provider": active_provider,
        "synced": synced_count,
        "failed_tickers": failed_tickers
    }


if __name__ == "__main__":
    try:
        sync_tickers()
    except Exception as e:
        print(f"Sync failed: {e}")


