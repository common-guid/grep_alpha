import unittest
import pandas as pd
import numpy as np
from src.analytics import calculate_atr

class TestATR(unittest.TestCase):
    def test_calculate_atr_empty_or_short(self):
        # Empty DataFrame
        df_empty = pd.DataFrame()
        atr_empty = calculate_atr(df_empty, period=14)
        self.assertTrue(atr_empty.empty)

        # DataFrame shorter than the period
        df_short = pd.DataFrame({
            'high': [10, 11, 12],
            'low': [9, 10, 11],
            'close': [10, 11, 12]
        })
        atr_short = calculate_atr(df_short, period=5)
        
        # Should either be empty or all NaNs
        if not atr_short.empty:
            self.assertTrue(atr_short.isna().all())

    def test_calculate_atr_mathematical_correctness(self):
        # Create a mock dataframe of 16 days with known high, low, close
        # Day 1: close = 100, high = 110, low = 90 (TR = 20)
        # Days 2-15: high = 110, low = 90, close = 100 (TR = 20)
        # Day 16: high = 130, low = 110, close = 120
        # Since close_prev for Day 16 is 100:
        # TR1 = 130 - 110 = 20
        # TR2 = |130 - 100| = 30
        # TR3 = |110 - 100| = 10
        # So TR for Day 16 = max(20, 30, 10) = 30.
        # ATR for day 14 (index 13): 20
        # ATR for day 15 (index 14): (20 * 13 + 20) / 14 = 20
        # ATR for day 16 (index 15): (20 * 13 + 30) / 14 = 290 / 14 = 20.7142857
        
        dates = pd.date_range(start="2023-01-01", periods=16)
        highs = [110] * 15 + [130]
        lows = [90] * 15 + [110]
        closes = [100] * 15 + [120]
        
        df = pd.DataFrame({
            'high': highs,
            'low': lows,
            'close': closes
        }, index=dates)
        
        atr = calculate_atr(df, period=14)
        
        # Checking lengths
        self.assertEqual(len(atr), 16)
        
        # Check first 13 elements are NaN/missing
        for idx in range(13):
            self.assertTrue(np.isnan(atr.iloc[idx]))
            
        # Day 14 ATR is the SMA of first 14 TRs (which are all 20)
        self.assertAlmostEqual(atr.iloc[13], 20.0)
        
        # Day 15 ATR: (20 * 13 + 20) / 14 = 20.0
        self.assertAlmostEqual(atr.iloc[14], 20.0)
        
        # Day 16 ATR: (20 * 13 + 30) / 14 = 20.7142857
        self.assertAlmostEqual(atr.iloc[15], 290.0 / 14.0)

if __name__ == "__main__":
    unittest.main()
