# Product Requirements Document (PRD): CLI Momentum & Watchlist Tracker

## 1. Project Overview
A hybrid CLI/Web application designed for swing traders and momentum investors. The system allows users to define, manage, and annotate stock watchlists strictly from the command line, while providing a locally-hosted, interactive web interface for rapid, high-resolution chart reviews (Flip-Charts) and sector momentum analysis.

## 2. Core Objectives
* **Frictionless Management:** Add, remove, and annotate tickers across thematic watchlists (e.g., `AI_adjacent`, `drone_makers`) entirely via the terminal.
* **Smart Data Ingestion:** Fetch end-of-day (EOD) pricing data via the Alpaca API, storing it in a lightweight local database to minimize API calls and maximize speed.
* **Visual Momentum Review:** Launch an ephemeral local web server from the CLI to view 3-month and 1-year interactive charts.
* **Sector Analysis:** Automatically calculate and visualize equal-weighted and price-weighted indices for each watchlist, normalized to a base of 100.

## 3. Technical Stack
* **Language:** Python 3.10+
* **CLI Framework:** `Typer` (for intuitive, git-like command structures, e.g., `watch add AAPL tech`).
* **Configuration / Watchlists:** `YAML` (for human-readable, version-controllable data entry and theses).
* **Database:** `SQLite` (with `pandas` for time-series manipulation). It's built into Python, requires no background service, and is perfectly fast enough for daily EOD data.
* **Market Data:** Alpaca API (Historical EOD endpoints).
* **Visualization Environment:** `Streamlit` (Allows you to build beautiful, browser-based data apps purely in Python).
* **Charting Library:** `Plotly` (Provides the high-resolution, interactive, zoomable, and swipe-friendly charts rendered within Streamlit).

## 4. Functional Requirements

### 4.1 CLI Watchlist Management (`YAML` + `Typer`)
* The system must read from a dedicated directory of `.yml` files.
* **Commands Needed:**
  * `watch ls`: List all active watchlists.
  * `watch add <ticker> <category>`: Append a ticker to a specific YAML file.
  * `watch rm <ticker> <category>`: Remove a ticker.
  * `watch note <ticker> "thesis text"`: Quickly add/update a thesis string for a ticker.

### 4.2 Data Ingestion & Caching (`SQLite` + Alpaca)
* **Command:** `watch sync`
* **Behavior:** 1. Parses all YAML files to get a unique master list of tickers.
  2. Queries the local SQLite database to find the last fetched date for each ticker.
  3. Pings the Alpaca API to fetch *only* the missing daily data (delta fetch).
  4. Appends the new data to the SQLite database.
* **Schema:** A simple table: `Date`, `Ticker`, `Open`, `High`, `Low`, `Close`, `Volume`.

### 4.3 Aggregate Index Calculation Engine
* **Math:** When rendering the UI, the backend must group tickers by their YAML category.
* **Normalization:** For both 3-month and 1-year lookbacks, take the first available closing price of the period, divide subsequent days by that initial price, and multiply by 100.
* **Weighting:**
  * *Price-Weighted:* Sum the raw prices of the components and normalize the aggregate.
  * *Equal-Weighted:* Normalize each individual component to 100 first, then average those normalized values daily.

### 4.4 The "Flip-Chart" Interface (`Streamlit`)
* **Command:** `watch review <category>` (or `watch review all`)
* **Behavior:** Spins up a local Streamlit server and automatically opens the default web browser.
* **UI Layout:**
  * **Top Section (The Sector View):** Two line charts showing the Price-Weighted vs. Equal-Weighted indices for the selected watchlist (Base 100) alongside a benchmark (like SPY or QQQ).
  * **Bottom Section (The Flip-Charts):** A pagination layout or a clean vertical scroll of interactive Plotly candlestick or line charts. Each ticker has a toggle for 3-Month and 1-Year views.
  * **Context:** The user's thesis/notes from the YAML file should display directly beneath or beside each ticker's chart.

## 5. Development Phases

### Phase 1: CLI & Data Structure
* Initialize the project.
* Set up the YAML parsing logic.
* Build the basic `Typer` CLI to add/remove tickers and list watchlists.

### Phase 2: The Data Pipeline
* Set up the SQLite database schema.
* Write the Alpaca API connection module.
* Implement the `sync` logic to handle delta-fetching daily prices and storing them locally.

### Phase 3: The Math & Visualization
* Build the `pandas` logic to calculate the Base-100 indices.
* Create a basic Streamlit app that reads from the SQLite DB and renders a static line chart.
* Wire the CLI `watch review` command to trigger `streamlit run app.py`.

### Phase 4: Polish & "Flip-Chart" UX
* Integrate Plotly for high-res candlesticks.
* Design the Streamlit UI to ensure easy scrolling/flipping through dozens of charts.
* Overlay the YAML thesis data onto the UI.
