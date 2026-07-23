import pandas as pd
import sqlite3
from datetime import datetime, timedelta
from src import database

def calculate_indices(tickers: list[str], timeframe: str = "3m"):
    """
    Calculates Price-Weighted and Equal-Weighted indices for a list of tickers.
    
    timeframe: "3m" for 3 months, "1y" for 1 year.
    Returns a pandas DataFrame with 'Price-Weighted' and 'Equal-Weighted' columns.
    """
    if not tickers:
        return pd.DataFrame()

    # Ensure table exists before querying
    database.init_db()

    # Determine start date
    today = datetime.now().date()
    if timeframe == "3m":
        start_date = today - timedelta(days=90)
    elif timeframe == "1y":
        start_date = today - timedelta(days=365)
    else:
        raise ValueError("Invalid timeframe. Use '3m' or '1y'.")

    # Query database
    conn = sqlite3.connect(database.DB_PATH)
    placeholders = ','.join(['?'] * len(tickers))
    query = f"""
        SELECT date, ticker, close 
        FROM daily_prices 
        WHERE ticker IN ({placeholders}) 
        AND date >= ?
        ORDER BY date ASC
    """
    params = tickers + [start_date.isoformat()]
    df = pd.read_sql_query(query, conn, params=params)
    conn.close()

    if df.empty:
        return pd.DataFrame()

    # Pivot data: index=date, columns=ticker, values=close
    pivot_df = df.pivot(index='date', columns='ticker', values='close')
    
    # Drop rows with any NaN to ensure we have all tickers for the index calculation
    # (Alternative: forward fill, but for a clean index we might want full data)
    pivot_df = pivot_df.dropna()
    
    if pivot_df.empty:
        return pd.DataFrame()

    # 1. Price-Weighted Index
    # (Sum of prices) / (Sum of prices at start) * 100
    daily_sum = pivot_df.sum(axis=1)
    base_price_sum = daily_sum.iloc[0]
    price_weighted = (daily_sum / base_price_sum) * 100

    # 2. Equal-Weighted Index
    # Each ticker normalized to 100 at start, then averaged
    normalized_tickers = pivot_df.div(pivot_df.iloc[0]) * 100
    equal_weighted = normalized_tickers.mean(axis=1)

    # Combine into result DataFrame
    results = pd.DataFrame({
        'Price-Weighted': price_weighted,
        'Equal-Weighted': equal_weighted
    })

    return results

def calculate_atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    """
    Calculates the Average True Range (ATR) of a stock over a given period.
    
    df: DataFrame containing at least 'high', 'low', and 'close' columns.
    period: Volatility period (default 14).
    Returns a pandas Series of the ATR values.
    """
    if df.empty or len(df) < period:
        return pd.Series(index=df.index, dtype='float64')

    # True Range calculation:
    high = df['high']
    low = df['low']
    close_prev = df['close'].shift(1)

    tr1 = high - low
    tr2 = (high - close_prev).abs()
    tr3 = (low - close_prev).abs()

    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)

    # Wilder's Smoothing:
    atr = pd.Series(index=df.index, dtype='float64')
    
    # First ATR value is SMA of the first 'period' TRs
    first_atr = tr.iloc[0:period].mean()
    atr.iloc[period - 1] = first_atr

    # Subsequent values: ATR_t = (ATR_{t-1} * (period - 1) + TR_t) / period
    curr_atr = first_atr
    for i in range(period, len(df)):
        curr_atr = (curr_atr * (period - 1) + tr.iloc[i]) / period
        atr.iloc[i] = curr_atr

    return atr

if __name__ == "__main__":
    # Example usage (requires data in DB)
    try:
        idx_df = calculate_indices(["AAPL", "MSFT"], "3m")
        print(idx_df.tail())
    except Exception as e:
        print(f"Calculation failed: {e}")

