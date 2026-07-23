import sqlite3
import os
from typing import Optional, List, Tuple

# Resolve DB_PATH relative to the workspace root directory
_current_dir = os.path.dirname(os.path.abspath(__file__))
_workspace_root = os.path.dirname(os.path.dirname(_current_dir))
DB_PATH = os.path.join(_workspace_root, "data.db")

def get_connection():
    return sqlite3.connect(DB_PATH)

def init_db():
    """Initializes the database and creates the daily_prices table."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS daily_prices (
                date TEXT,
                ticker TEXT,
                open REAL,
                high REAL,
                low REAL,
                close REAL,
                volume INTEGER,
                PRIMARY KEY (date, ticker)
            )
        """)
        conn.commit()

def get_last_updated_date(ticker: str) -> Optional[str]:
    """Queries the most recent date a specific ticker was updated."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT MAX(date) FROM daily_prices WHERE ticker = ?", 
            (ticker.upper(),)
        )
        result = cursor.fetchone()
        return result[0] if result and result[0] else None

def get_price_data(ticker: str, start_date: str) -> List[Tuple]:
    """Fetches daily price data for a ticker since start_date."""
    init_db()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT date, open, high, low, close, volume 
            FROM daily_prices 
            WHERE ticker = ? AND date >= ?
            ORDER BY date ASC
            """,
            (ticker.upper(), start_date)
        )
        return cursor.fetchall()

def insert_daily_prices(data: List[Tuple]):
    """Bulk inserts new records into the daily_prices table."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.executemany(
            """
            INSERT OR REPLACE INTO daily_prices (date, ticker, open, high, low, close, volume)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            data
        )
        conn.commit()
