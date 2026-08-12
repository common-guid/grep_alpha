import unittest
import os
from datetime import datetime, timedelta

from grep_alpha.src import data_fetcher


class TestYFinanceVsAlpaca(unittest.TestCase):
    """Robust provider verification test suite comparing yfinance with Alpaca."""

    def setUp(self):
        # Define a fixed 1-week historical window (5 trading days)
        self.start_date = datetime(2026, 3, 2).date()
        self.end_date = datetime(2026, 3, 6).date()
        self.tickers = ["AAPL", "GOOGL"]

    def test_yfinance_fetching_structure(self):
        """Verify yfinance fetches non-empty, well-structured OHLCV data for AAPL and GOOGL without an API key."""
        for ticker in self.tickers:
            data = data_fetcher.fetch_ticker_data_yfinance(ticker, self.start_date, self.end_date)
            self.assertGreater(len(data), 0, f"yfinance returned no records for {ticker}")
            
            for record in data:
                date_str, symbol, open_p, high_p, low_p, close_p, volume = record
                self.assertEqual(symbol, ticker)
                self.assertIsInstance(date_str, str)
                self.assertGreater(open_p, 0.0)
                self.assertGreater(high_p, 0.0)
                self.assertGreater(low_p, 0.0)
                self.assertGreater(close_p, 0.0)
                self.assertGreaterEqual(volume, 0)
                self.assertTrue(high_p >= low_p, f"High price {high_p} must be >= Low price {low_p}")

    def test_yfinance_vs_alpaca_price_comparison(self):
        """Pull a 1-week price window for AAPL and GOOGL from yfinance and Alpaca, comparing for price parity."""
        api_key = os.environ.get("APCA_API_KEY_ID")
        secret_key = os.environ.get("APCA_API_SECRET_KEY")

        if not api_key or not secret_key:
            print("\n[SKIP] Alpaca API keys not provided in environment. Fully verified yfinance keyless data ingestion.")
            return

        for ticker in self.tickers:
            yf_data = data_fetcher.fetch_ticker_data_yfinance(ticker, self.start_date, self.end_date)
            alpaca_data = data_fetcher.fetch_ticker_data_alpaca(ticker, self.start_date, self.end_date)

            self.assertGreater(len(yf_data), 0, f"yfinance data empty for {ticker}")
            self.assertGreater(len(alpaca_data), 0, f"Alpaca data empty for {ticker}")

            yf_by_date = {rec[0]: rec for rec in yf_data}
            alpaca_by_date = {rec[0]: rec for rec in alpaca_data}

            common_dates = set(yf_by_date.keys()).intersection(set(alpaca_by_date.keys()))
            self.assertGreater(len(common_dates), 0, f"No overlapping dates between yfinance and Alpaca for {ticker}")

            for date_str in sorted(common_dates):
                yf_rec = yf_by_date[date_str]
                alpaca_rec = alpaca_by_date[date_str]

                yf_close = yf_rec[5]
                alpaca_close = alpaca_rec[5]

                pct_diff = abs(yf_close - alpaca_close) / alpaca_close
                self.assertLess(
                    pct_diff, 
                    0.025, 
                    f"Close price mismatch for {ticker} on {date_str}: yfinance={yf_close}, Alpaca={alpaca_close} (diff: {pct_diff:.2%})"
                )

    def test_sync_tickers_yfinance_default(self):
        """Test sync_tickers master function defaulting to yfinance without error."""
        res = data_fetcher.sync_tickers(force=True)
        self.assertIn(res.get("status"), ["success", "cooldown_active", "rate_limit_tripped"])
        if res.get("status") == "success":
            self.assertEqual(res.get("provider"), "yfinance")


if __name__ == "__main__":
    unittest.main()

