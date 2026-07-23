## Phase 1: Project Skeleton & CLI Foundation | 2026-03-21
Set up the project structure, including directories and requirements.
Implemented `YAMLManager` for CRUD operations on YAML watchlists.
Created a `Typer`-based CLI in `cli.py` with commands: `watch ls`, `watch add`, `watch rm`, and `watch note`.
Verified functionality with unit tests for `YAMLManager`.
Created Dockerfile and docker-compose.yml for future use.

## Phase 2: Data Pipeline & Storage | 2026-03-21
Implemented SQLite database schema in `src/database.py` with `daily_prices` table.
Created `src/data_fetcher.py` to handle Alpaca API integration and delta-sync logic.
Added `watch sync` command to the CLI to trigger data fetching.
Verified database operations with unit tests.

## Phase 3: Financial Engineering Engine | 2026-03-21
Created `src/analytics.py` for calculating sector indices.
Implemented Price-Weighted and Equal-Weighted index calculations using pandas.
Added normalization logic to base 100 for arbitrary timeframes (3m, 1y).
Verified mathematical logic with unit tests in `tests/test_analytics.py`.

## Phase 4: The Web Interface (Streamlit) | 2026-03-21
Developed `src/app.py` using Streamlit and Plotly.
Implemented sidebar for watchlist and timeframe selection.
Created index charts (Price-Weighted vs. Equal-Weighted) for sector-level analysis.
Developed "Flip-Chart" vertical scroll UI for individual ticker candlesticks and theses.
Integrated `database.py` for fetching historical price data.

## Phase 5: Final Integration | 2026-03-21
Added `watch review <category>` command to the CLI.
Implemented `subprocess` logic in `cli.py` to launch Streamlit from the terminal.
Updated `app.py` to support automatic category loading via `WATCHLIST_CATEGORY` environment variable.
Finalized the hybrid CLI/Web workflow for watchlist management and visual review.

## Bug Fix: Alpaca API Future Date & SIP Error | 2026-03-21
Fixed `watch sync` failing due to "recent SIP data" query on Free Tier.
Adjusted `end_date` logic in `src/data_fetcher.py` to always point to "yesterday" (today - 1 day).
Corrected logging to reflect the actual date range being fetched.
Validated date logic with `tests/test_date_logic.py`.

## Feature: Editable Thesis in UI | 2026-03-22
Implemented interactive thesis editing directly in the Streamlit web interface.
Added a pencil icon (📝) using `st.popover` for each ticker.
Integrated a `Save` button within the popover that persists changes to the YAML watchlist.
Ensured the UI reruns upon saving to reflect the updated thesis immediately.

## Watchlist update for NET and UI | 2026-03-25
Added `NET` and `UI` to `watchlists/tech.yml` with business-relevant tags and the thesis "increase network connectivity."
This expands the tech watchlist to cover network infrastructure and interface-driven digital operations themes.

## IBD weekly watchlist expansion | 2026-05-07
Appended the latest April-May 2026 IBD Weekly ticker entries to `watchlists/IBD_weekly.yaml` and refreshed the file's `updated` date.
Preserved the existing schema by adding each item as a separate watch entry with `status`, `target_entry`, `thesis`, and inferred tags.

## Feature: ATR Volatility Metric & Charts | 2026-05-26
Implemented 14-day Average True Range (ATR) calculation using Wilder's smoothing algorithm. Displayed ATR in Streamlit via real-time metric cards and a secondary Plotly line chart subplot synchronized with the main price candlestick chart.

## Watchlist defense_tech tags consolidation | 2026-06-05
Consolidated and simplified tags for all tickers in `watchlists/defense_tech.yaml` to belong to one or more of four categories: `defense`, `aero`, `drones`, and `space`. Added verification tests to validate tag consistency.

## Watchlist large_cap_bio tags consolidation | 2026-06-05
Consolidated and simplified tags for all tickers in `watchlists/large_cap_bio.yaml` to belong to one or more of three categories: `oncology`, `immunology`, and `specialty_care`. Added verification tests to validate tag consistency.

## Watchlist IBD_weekly and IDB_top_50 tags consolidation | 2026-06-05
Consolidated and simplified tags for all tickers in `watchlists/IBD_weekly.yaml` and `watchlists/IDB_top_50.yaml` into ten new categories (`semiconductors`, `software_internet`, `infrastructure_industrials`, `aerospace_space`, `healthcare_biotech`, `consumer_retail`, `transportation_logistics`, `energy_utilities`, `financials`, and `diversified_etfs`). Added verification tests to validate tag consistency across both files.

## Watchlist IBD_weekly ticker expansion | 2026-06-05
Expanded `watchlists/IBD_weekly.yaml` with tickers and theses from `tickers.txt`. Appended new theses to existing symbols with `[06/05/2026]` indicators, created new entries for missing symbols with appropriate consolidated tags, and preserved the original watchlist updated timestamp.

## Feature: Moving Average Toggles | 2026-06-06
Added interactive sidebar controls to toggle 10-day EMA, 50-day SMA, and 200-day SMA lines on all individual ticker price candlestick charts. Increased the historical data warm-up query to 350 days to support accurate longer-period rolling indicators.

## Watchlist IBD_weekly deduplication | 2026-06-06
Reviewed `watchlists/IBD_weekly.yaml` and consolidated duplicate entries (such as `CAT`, `GLW`, and `VIK`) by merging their theses and unique tags into single, unique entries.

