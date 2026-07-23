import streamlit as st
import pandas as pd
import plotly.graph_objects as go
from plotly.subplots import make_subplots
from datetime import datetime, timedelta
import sys
import os

# Ensure the root directory is in the path for module imports
sys.path.append(os.getcwd())

from src.yaml_manager import YAMLManager
from src.analytics import calculate_indices, calculate_atr
from src.database import get_price_data

# Set up page layout
st.set_page_config(layout="wide", page_title="Flip-Chart Monitor")

st.title("Watchlist Momentum & Flip-Charts")

# Initialize Managers
manager = YAMLManager()

# Sidebar: Watchlist Selection
watchlists = manager.list_watchlists()
if not watchlists:
    st.sidebar.error("No watchlists found in 'watchlists/'.")
    st.stop()

# Support pre-selection via env var (for CLI 'watch review' command)
default_cat = os.getenv("WATCHLIST_CATEGORY")
default_index = 0
if default_cat in watchlists:
    default_index = watchlists.index(default_cat)

selected_category = st.sidebar.selectbox("Select Watchlist", watchlists, index=default_index)

# Timeframe Selection
lookback = st.sidebar.radio("Lookback Period", ["3 Months", "1 Year"], index=0)
timeframe_key = "3m" if lookback == "3 Months" else "1y"
days_delta = 90 if timeframe_key == "3m" else 365
start_date = (datetime.now().date() - timedelta(days=days_delta)).isoformat()

# Sidebar: Moving Averages Selection
st.sidebar.subheader("Moving Averages")
show_ema10 = st.sidebar.checkbox("10-day EMA", value=False)
show_sma50 = st.sidebar.checkbox("50-day SMA", value=False)
show_sma200 = st.sidebar.checkbox("200-day SMA", value=False)

# Load Watchlist Data
watchlist_data = manager.get_watchlist(selected_category)
tickers_meta = watchlist_data.get("tickers", [])
ticker_symbols = [t["symbol"] for t in tickers_meta]

if not ticker_symbols:
    st.warning(f"No tickers found in '{selected_category}' watchlist.")
    st.stop()

# --- TOP SECTION: Sector Index View ---
st.subheader(f"{selected_category} Sector Momentum (Base 100)")

with st.spinner("Calculating indices..."):
    idx_df = calculate_indices(ticker_symbols, timeframe_key)

if not idx_df.empty:
    fig_idx = go.Figure()
    fig_idx.add_trace(go.Scatter(x=idx_df.index, y=idx_df['Price-Weighted'], name='Price-Weighted', line=dict(width=2)))
    fig_idx.add_trace(go.Scatter(x=idx_df.index, y=idx_df['Equal-Weighted'], name='Equal-Weighted', line=dict(width=2)))
    fig_idx.update_layout(
        height=400,
        margin=dict(l=20, r=20, t=20, b=20),
        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1)
    )
    st.plotly_chart(fig_idx, use_container_width=True)
else:
    st.info("No pricing data found in DB. Run 'watch sync' first.")

st.divider()

# --- BOTTOM SECTION: Flip-Charts ---
st.subheader("Individual Ticker Review")

# Callback function to save thesis
def save_thesis_callback(ticker_symbol, new_thesis):
    try:
        manager.update_thesis(selected_category, ticker_symbol, new_thesis)
        st.success(f"Saved thesis for {ticker_symbol}")
    except Exception as e:
        st.error(f"Failed to save thesis: {e}")

for item in tickers_meta:
    symbol = item["symbol"]
    current_thesis = item.get("thesis", "")
    
    with st.container():
        # Fetch individual ticker data with a 350-day warm-up for indicator calculations
        start_date_obj = datetime.fromisoformat(start_date)
        warmup_start_date = (start_date_obj - timedelta(days=350)).date().isoformat()
        price_rows = get_price_data(symbol, warmup_start_date)
        
        if price_rows:
            # Convert to DataFrame
            p_df = pd.DataFrame(price_rows, columns=['date', 'open', 'high', 'low', 'close', 'volume'])
            p_df['date'] = pd.to_datetime(p_df['date'])
            
            # Calculate ATR & Moving Averages before filtering
            p_df['atr'] = calculate_atr(p_df, period=14)
            p_df['ema10'] = p_df['close'].ewm(span=10, adjust=False).mean()
            p_df['sma50'] = p_df['close'].rolling(window=50).mean()
            p_df['sma200'] = p_df['close'].rolling(window=200).mean()
            
            # Filter to visible timeframe
            visible_start = pd.to_datetime(start_date)
            p_df = p_df[p_df['date'] >= visible_start].reset_index(drop=True)
            
            # Extract latest metrics
            if not p_df.empty:
                latest_row = p_df.iloc[-1]
                latest_close = latest_row['close']
                latest_atr = latest_row['atr']
                
                if len(p_df) >= 2:
                    prev_close = p_df.iloc[-2]['close']
                    close_delta = latest_close - prev_close
                    close_delta_pct = (close_delta / prev_close) * 100
                    delta_str = f"{close_delta:+.2f} ({close_delta_pct:+.2f}%)"
                else:
                    delta_str = None
                
                atr_pct = (latest_atr / latest_close) * 100 if pd.notna(latest_atr) else None
            else:
                latest_close = None
                latest_atr = None
                delta_str = None
                atr_pct = None
                
            # Header and Metrics Row
            header_col, m_col1, m_col2, m_col3 = st.columns([0.4, 0.2, 0.2, 0.2])
            with header_col:
                st.markdown(f"## {symbol}")
            with m_col1:
                if latest_close is not None:
                    st.metric("Latest Close", f"${latest_close:.2f}", delta=delta_str)
            with m_col2:
                if latest_atr is not None and pd.notna(latest_atr):
                    st.metric("ATR (14)", f"${latest_atr:.2f}")
            with m_col3:
                if atr_pct is not None:
                    st.metric("ATR % of Close", f"{atr_pct:.2f}%")
            
            # Create subplots: Row 1 is Candlesticks, Row 2 is ATR (14)
            fig = make_subplots(
                rows=2, cols=1, 
                shared_xaxes=True, 
                vertical_spacing=0.05, 
                row_heights=[0.75, 0.25]
            )
            
            # 1. Add Candlestick to Row 1
            fig.add_trace(
                go.Candlestick(
                    x=p_df['date'],
                    open=p_df['open'],
                    high=p_df['high'],
                    low=p_df['low'],
                    close=p_df['close'],
                    name="Price"
                ),
                row=1, col=1
            )
            
            # Add Moving Averages to Row 1 if toggled
            if show_ema10:
                fig.add_trace(
                    go.Scatter(
                        x=p_df['date'],
                        y=p_df['ema10'],
                        name="10 EMA",
                        line=dict(color='#00bec4', width=1.5)
                    ),
                    row=1, col=1
                )
            if show_sma50:
                fig.add_trace(
                    go.Scatter(
                        x=p_df['date'],
                        y=p_df['sma50'],
                        name="50 SMA",
                        line=dict(color='#ffc107', width=1.5)
                    ),
                    row=1, col=1
                )
            if show_sma200:
                fig.add_trace(
                    go.Scatter(
                        x=p_df['date'],
                        y=p_df['sma200'],
                        name="200 SMA",
                        line=dict(color='#ff4757', width=1.5)
                    ),
                    row=1, col=1
                )
            
            # 2. Add ATR (14) line chart to Row 2
            fig.add_trace(
                go.Scatter(
                    x=p_df['date'],
                    y=p_df['atr'],
                    name="ATR (14)",
                    line=dict(color='#ff9f43', width=2),
                    fill='tozeroy',
                    fillcolor='rgba(255, 159, 67, 0.1)'
                ),
                row=2, col=1
            )
            
            # Style the figure
            fig.update_layout(
                height=600,
                margin=dict(l=20, r=20, t=20, b=20),
                legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1)
            )
            
            # Hide range slider and label axes
            fig.update_xaxes(rangeslider_visible=False)
            fig.update_yaxes(title_text="Price ($)", row=1, col=1)
            fig.update_yaxes(title_text="ATR ($)", row=2, col=1)
            fig.update_xaxes(title_text="Date", row=2, col=1)
            
            st.plotly_chart(fig, use_container_width=True)
            
            # Thesis display area with pencil icon for editing
            t_col1, t_col2 = st.columns([0.9, 0.1])
            
            with t_col1:
                st.info(f"**Thesis:** {current_thesis if current_thesis else 'No thesis provided.'}")
            
            with t_col2:
                # Pencil icon using st.popover
                with st.popover("📝"):
                    new_thesis_val = st.text_area(
                        f"Edit thesis for {symbol}", 
                        value=current_thesis,
                        key=f"edit_{symbol}_{selected_category}"
                    )
                    if st.button("Save", key=f"btn_{symbol}_{selected_category}"):
                        save_thesis_callback(symbol, new_thesis_val)
                        st.rerun()
                        
        else:
            st.warning(f"No data available for {symbol}.")
        
        st.divider()
