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
    """Initializes the database and creates necessary tables."""
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
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS system_locks (
                lock_name TEXT PRIMARY KEY,
                locked_until TEXT NOT NULL,
                reason TEXT,
                created_at TEXT NOT NULL
            )
        """)
        conn.commit()

from datetime import datetime, timedelta

def set_rate_limit_cooldown(hours: float = 24.0, reason: str = "API Rate Limit Hit") -> str:
    """Set a persistent rate-limit cooldown lock for the specified duration (in hours)."""
    init_db()
    with get_connection() as conn:
        cursor = conn.cursor()
        now = datetime.utcnow()
        locked_until_dt = now + timedelta(hours=hours)
        locked_until_str = locked_until_dt.isoformat()
        cursor.execute("""
            INSERT OR REPLACE INTO system_locks (lock_name, locked_until, reason, created_at)
            VALUES ('rate_limit_cooldown', ?, ?, ?)
        """, (locked_until_str, reason, now.isoformat()))
        conn.commit()
    return locked_until_str

def get_rate_limit_cooldown_status() -> dict:
    """Check if 24-hour rate limit cooldown is active."""
    init_db()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT locked_until, reason, created_at FROM system_locks WHERE lock_name = 'rate_limit_cooldown'")
        row = cursor.fetchone()
        
    if not row:
        return {"active": False, "locked_until": None, "reason": None, "remaining_seconds": 0, "remaining_hours": 0.0}
    
    locked_until_str, reason, created_at = row
    try:
        locked_until_dt = datetime.fromisoformat(locked_until_str)
        now = datetime.utcnow()
        if now < locked_until_dt:
            remaining_seconds = int((locked_until_dt - now).total_seconds())
            return {
                "active": True,
                "locked_until": locked_until_str,
                "reason": reason,
                "created_at": created_at,
                "remaining_seconds": remaining_seconds,
                "remaining_hours": round(remaining_seconds / 3600.0, 1)
            }
    except Exception:
        pass
        
    return {"active": False, "locked_until": None, "reason": None, "remaining_seconds": 0, "remaining_hours": 0.0}

def clear_rate_limit_cooldown():
    """Clear any active rate-limit cooldown lock."""
    init_db()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM system_locks WHERE lock_name = 'rate_limit_cooldown'")
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

