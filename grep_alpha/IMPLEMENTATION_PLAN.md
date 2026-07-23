### Phase 1: Project Skeleton & CLI Foundation

**Prompt 1: Environment & Directory Setup**
> "Execute Step 1.1: Set up the project structure. Create the main project directory, a `requirements.txt` file including `typer`, `pyyaml`, `pandas`, `sqlite3`, `alpaca-trade-api`, `streamlit`, and `plotly`. Create a `src` directory with an empty `__init__.py`, and a `watchlists` directory to hold the YAML files. Finally, create a template `tech.yml` file in the `watchlists` directory following the structure defined in the PRD."

**Prompt 2: YAML Data Manager**
> "Execute Step 1.2: Create `src/yaml_manager.py`. Write a class or set of functions to handle CRUD operations for the YAML files in the `watchlists` directory. It needs methods to: 1) List all watchlist names (filenames), 2) Read a specific watchlist and return its tickers and theses, 3) Add a new ticker to a specific watchlist, and 4) Remove a ticker from a specific watchlist. Ensure robust error handling if a file doesn't exist."

**Prompt 3: Typer CLI Interface**
> "Execute Step 1.3: Create `src/cli.py`. Initialize a Typer app. Import the functions from `yaml_manager.py` and create the following CLI commands: `watch ls`, `watch add <ticker> <category>`, `watch rm <ticker> <category>`, and `watch note <ticker> <category> "<thesis>"`. Wire these commands up so they properly update the YAML files. Set up an entry point so I can run this CLI locally."

### Phase 2: Data Pipeline & Storage

**Prompt 4: SQLite Database Setup**
> "Execute Step 2.1: Create `src/database.py`. Set up a SQLite database connection. Create an initialization function that ensures a table named `daily_prices` exists. The schema should be: `date` (TEXT), `ticker` (TEXT), `open` (REAL), `high` (REAL), `low` (REAL), `close` (REAL), `volume` (INTEGER). Create a composite primary key using `date` and `ticker`. Write a function to query the most recent date a specific ticker was updated in the database."

**Prompt 5: Alpaca API Integration & Sync Logic**
> "Execute Step 2.2: Create `src/data_fetcher.py`. Use the Alpaca API to fetch historical daily bar data. Write a `sync_tickers` function. This function must: 1) Get the master list of all unique tickers across all YAML watchlists using `yaml_manager.py`, 2) Check `database.py` for the last fetched date for each ticker, 3) Fetch only the missing daily data from Alpaca up to today, and 4) Bulk insert the new records into the SQLite database. Add a `watch sync` command to the Typer CLI in `cli.py` to trigger this process."

### Phase 3: Financial Engineering Engine

**Prompt 6: Index Calculation Module**
> "Execute Step 3.1: Create `src/analytics.py`. Write a function that takes a list of tickers and a timeframe (e.g., 3 months, 1 year). It should query the SQLite database for the daily closing prices of those tickers over that timeframe. Then, using pandas, calculate a daily Price-Weighted index and an Equal-Weighted index for that group of tickers. Both indices must be normalized to a base of 100 on the first day of the timeframe. Return this data as a pandas DataFrame."

### Phase 4: The Web Interface (Streamlit)

**Prompt 7: Streamlit Shell & Routing**
> "Execute Step 4.1: Create `src/app.py`. Set up a basic Streamlit application. Read the available watchlists using `yaml_manager.py` and create a sidebar dropdown to select a watchlist category. When a category is selected, display the raw YAML data (tickers and theses) on the main page just to verify the connection is working."

**Prompt 8: Plotly Charting & UI Polish**
> "Execute Step 4.2: Update `src/app.py` to fully implement the 'Flip-Chart' UI described in the PRD. 
> Top Section: Call the index calculation function from `analytics.py` for the selected watchlist and render a Plotly line chart showing the Price-Weighted and Equal-Weighted indices (Base 100).
> Bottom Section: Iterate through each ticker in the watchlist. For each, query its daily data from SQLite, and render a high-resolution Plotly candlestick chart. Display the user's thesis from the YAML file directly below the respective chart. Include a UI toggle (radio button or selectbox) at the top of the page to switch all charts between a 3-month and 1-year lookback."

### Phase 5: Final Integration

**Prompt 9: Wire CLI to Streamlit**
> "Execute Step 5.1: Update `src/cli.py`. Add a new command: `watch review <category>`. This command should use Python's `subprocess` or `os.system` to execute `streamlit run src/app.py` and pass the selected category as a command-line argument or environment variable so Streamlit automatically loads the correct watchlist upon opening the browser."
