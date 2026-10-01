# CLI Momentum & Watchlist Tracker

A hybrid CLI/Web application designed for swing traders and momentum investors. Manage stock watchlists with speed in the terminal and review high-resolution "Flip-Charts" and sector momentum in a local web interface.

## 🚀 Features

*   **Terminal-First Management:** Add, remove, and annotate tickers across thematic watchlists (YAML-based) without leaving your terminal.
*   **Automated Data Pipeline:** Fetch historical EOD pricing data keylessly via Yahoo Finance (`yfinance`) or Alpaca API and cache it in a local SQLite database for instant loading.
*   **Sector Momentum Analysis:** Automatically calculate **Price-Weighted** and **Equal-Weighted** indices (Base 100) for every watchlist to identify sector-wide strength.
*   **High-Res "Flip-Charts":** A streamlined Streamlit UI designed for rapid visual review of interactive Plotly candlestick charts.
*   **Contextual Notes:** Your trading thesis for each ticker is displayed directly beneath its chart for informed decision-making.

---

## 🛠️ Installation

### 1. Prerequisites
*   Python 3.10+
*   Optional: Alpaca Markets account if configuring Alpaca as fallback provider (Free "Paper Trading" keys work perfectly).

### 2. Setup
Clone the repository and install dependencies:

```bash
pip install -r requirements.txt
```


### 3. Environment Configuration (Optional)
Data fetching defaults to keyless Yahoo Finance. If using Alpaca, create a `.env` file or export the following variables:

```bash
export DATA_PROVIDER="yfinance" # or "alpaca"
export APCA_API_KEY_ID="your_key_id"
export APCA_API_SECRET_KEY="your_secret_key"
export APCA_API_BASE_URL="https://paper-api.alpaca.markets"
```

---

## 📖 Usage Guide

The application is controlled via the `watch` command group in `src/cli.py`.

### 1. Manage Watchlists
Watchlists are stored as human-readable YAML files in the `watchlists/` directory.

*   **List all watchlists:**
    ```bash
    python src/cli.py watch ls
    ```
*   **Add a ticker:**
    ```bash
    python src/cli.py watch add AAPL tech --thesis "Breaking out of cup and handle"
    ```
*   **Update a thesis:**
    ```bash
    python src/cli.py watch note AAPL tech "Revised: targeting $220"
    ```
*   **Remove a ticker:**
    ```bash
    python src/cli.py watch rm AAPL tech
    ```

### 2. Sync Data
Before viewing charts, sync the local database with the latest market data:

```bash
python src/cli.py watch sync
```
*This performs a delta-sync, only fetching missing days since the last update.*

### 3. Visual Review ("Flip-Charts")
Launch the interactive web interface for a specific category:

```bash
python src/cli.py watch review tech
```
*This will open your browser to a Streamlit dashboard showing sector indices and individual charts for the 'tech' watchlist.*

---

## 🧪 Financial Engineering: Base 100 Indices

The "Sector View" at the top of the web interface uses two calculation methods to show group momentum, both normalized to **100** at the start of the selected timeframe (3m or 1y):

1.  **Price-Weighted Index:** Mimics the Dow Jones approach. It sums the prices of all components. Higher-priced stocks have more influence.
2.  **Equal-Weighted Index:** Normalizes every stock to 100 on Day 1. This shows how the *average* stock in the group is performing, preventing a single high-priced outlier from distorting the view.

---

## 🛠️ Extending the Project

The modular architecture makes it easy to add new features:

### Adding New Analytics
Modify `src/analytics.py`. You can add functions to calculate:
*   Relative Strength (RS) compared to SPY.
*   Moving Average (MA) breadth for a watchlist.
*   Volatility (ATR) based position sizing.

### Enhancing the UI
Modify `src/app.py`. Streamlit makes it simple to:
*   Add technical indicators (RSI, MACD) to the Plotly charts.
*   Include fundamental data (Market Cap, P/E Ratio) in the ticker headers.
*   Add a "Scanner" page that alerts you to tickers crossing their 50-day moving average.

### Custom Data Sources
If you prefer Yahoo Finance or Polygon.io, simply update the `sync_tickers` logic in `src/data_fetcher.py`. As long as you populate the `daily_prices` table in `data.db` with the standard schema, the rest of the app will work seamlessly.

---

## 🐳 Docker Support
Run the unified FastAPI backend and React FlipCharts interface without installing Python locally. Run the following commands from the repository root (the parent of this directory), where the root `docker-compose.yml` lives. The web interface will be available at **http://localhost:3000**; Docker does not launch the legacy Streamlit dashboard.

```bash
# 1. Build and start the container
docker compose up -d --build

# 2. Sync data (first time or daily)
docker compose exec app python -m grep_alpha.src.cli watch sync

# 3. Open http://localhost:3000 in your browser
```

Compose stores the SQLite cache at `/app/data/data.db` in the persistent `app_data` named volume and creates it automatically on first startup. No host `data.db` file is required. The volume survives container recreation and `docker compose down`; `docker compose down -v` deletes it.

Local Python runs still default to the workspace-root `data.db`, with `DB_PATH` available to override that location. The local and Docker caches are separate by default, so use the container sync command above to populate charts served by Docker. Existing host caches are not imported automatically; see the [root Docker deployment guide](../README.md#-docker-deployment) for persistence and migration details.
