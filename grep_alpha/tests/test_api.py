import pytest
from fastapi.testclient import TestClient
import os
import sys

# Ensure workspace root is in path
WORKSPACE_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if WORKSPACE_ROOT not in sys.path:
    sys.path.insert(0, WORKSPACE_ROOT)

from backend.main import app

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
    assert response.status_code == 404

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
