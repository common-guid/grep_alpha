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

def sync_tickers():
    """Sync missing daily data from Alpaca to the local SQLite database."""
    database.init_db()
    tickers = get_unique_tickers()
    if not tickers:
        print("No tickers found in watchlists.")
        return

    api = get_alpaca_client()
    # EOD data is best fetched for "yesterday" (or even 2 days ago to be safe on weekends/holidays)
    # to avoid "recent SIP data" errors on Free Tier.
    # On Sunday March 22, "yesterday" is Saturday March 21 (no data), 2 days ago is Friday March 20.
    today = datetime.now().date()
    end_date = today - timedelta(days=2) 
    
    for ticker in tickers:
        last_date_str = database.get_last_updated_date(ticker)
        
        if last_date_str:
            # Start from the day after the last date
            start_date = datetime.strptime(last_date_str, "%Y-%m-%d").date() + timedelta(days=1)
        else:
            # If no data, default to 1 year ago (as a reasonable default)
            start_date = today - timedelta(days=365)
        
        if start_date > end_date:
            print(f"Ticker {ticker} is already up to date (last date: {last_date_str or 'N/A'}).")
            continue

        print(f"Fetching data for {ticker} from {start_date} to {end_date}...")
        
        try:
            # Fetch bars
            # For Free accounts, 'iex' is required for recent data (15 min delay).
            # Even for Paid accounts, 'iex' is often safer for automated historical fetches.
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
            
            # Prepare data for insertion
            # The index of the dataframe is the timestamp
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
            print(f"Inserted {len(db_data)} records for {ticker}.")
            
        except Exception as e:
            print(f"Error fetching data for {ticker}: {e}")

if __name__ == "__main__":
    # For manual testing if credentials are set
    try:
        sync_tickers()
    except Exception as e:
        print(f"Sync failed: {e}")
