import pytest
from fastapi.testclient import TestClient
import os
import sys

# Ensure workspace root is in path
WORKSPACE_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if WORKSPACE_ROOT not in sys.path:
    sys.path.insert(0, WORKSPACE_ROOT)

from backend.main import app
from grep_alpha.src import database
import tempfile

client = TestClient(app)

def test_get_watchlists():
    response = client.get("/api/watchlists")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    if len(data) > 0:
        first = data[0]
        assert "id" in first
        assert "name" in first
        assert "symbol_count" in first
        assert "symbols" in first

def test_get_watchlist_detail():
    # Fetch list first to get a valid category ID
    res_list = client.get("/api/watchlists")
    assert res_list.status_code == 200
    categories = res_list.json()
    if categories:
        cat_id = categories[0]["id"]
        response = client.get(f"/api/watchlists/{cat_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == cat_id
        assert "tickers" in data

def test_get_watchlist_not_found():
    response = client.get("/api/watchlists/non_existent_watchlist_12345")
    assert response.status_code == 200
    data = response.json()
    assert "tickers" in data

def test_get_prices():
    # Query prices for a known ticker, e.g., AAPL
    response = client.get("/api/prices?symbol=AAPL&timeframe=3M")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    if len(data) > 0:
        row = data[0]
        assert "time" in row
        assert "open" in row
        assert "high" in row
        assert "low" in row
        assert "close" in row
        assert "volume" in row

def test_get_sector_momentum():
    res_list = client.get("/api/watchlists")
    assert res_list.status_code == 200
    categories = res_list.json()
    if categories:
        cat_id = categories[0]["id"]
        response = client.get(f"/api/analytics/sector-momentum?category={cat_id}&timeframe=3m")
        assert response.status_code == 200
        data = response.json()
        assert "date" in data
        assert "price_weighted" in data
        assert "equal_weighted" in data

def test_get_status():
    response = client.get("/api/status")
    assert response.status_code == 200
    data = response.json()
    assert "sync" in data
    assert "database" in data

def test_status_startup_schema_init_fresh_temp_db():
    """V4 regression test: fresh temp DB_PATH + FastAPI TestClient GET /api/status succeeds (proves startup schema init)."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        temp_db_path = os.path.join(tmp_dir, "fresh_status_test.db")
        original_db_path = database.DB_PATH
        try:
            database.DB_PATH = temp_db_path
            assert not os.path.exists(temp_db_path)
            
            with TestClient(app) as test_client:
                response = test_client.get("/api/status")
                assert response.status_code == 200
                data = response.json()
                assert "database" in data
                assert data["database"]["path"] == temp_db_path
                assert data["database"]["unique_tickers"] == 0
                assert data["database"]["total_records"] == 0
                
            import sqlite3
            with sqlite3.connect(temp_db_path) as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='daily_prices'")
                assert cursor.fetchone() is not None
        finally:
            database.DB_PATH = original_db_path


def test_watchlist_yaml_serves_live_master_file():
    """Regression: /watchlist.yaml must serve the live master file, not the
    build-time dist copy. External watchlist changes (pipeline merges, migrations)
    must be visible to the SPA without an image rebuild."""
    response = client.get("/watchlist.yaml")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/yaml")
    served = response.text
    master_path = os.path.join(WORKSPACE_ROOT, "FlipCharts", "watchlist.yaml")
    with open(master_path, "r", encoding="utf-8") as fh:
        master = fh.read()
    assert served == master, "/watchlist.yaml content differs from live master file"
