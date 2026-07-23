import unittest
import pandas as pd
import numpy as np

class TestMovingAverages(unittest.TestCase):
    def test_ema10_calculation(self):
        """Verify the 10-day EMA calculation logic matches expected pandas ewm behaviour."""
        prices = pd.Series([100.0] * 20)
        # EMA of constant prices should remain constant
        ema10 = prices.ewm(span=10, adjust=False).mean()
        self.assertEqual(ema10.iloc[-1], 100.0)
        
        # Test with a step increase
        prices_step = pd.Series([100.0] * 10 + [110.0] * 10)
        ema10_step = prices_step.ewm(span=10, adjust=False).mean()
        # Day 11 (first day of step change):
        # Prev EMA = 100
        # Multiplier = 2 / (10 + 1) = 2/11 = 0.1818
        # New EMA = (110 - 100) * 0.1818 + 100 = 101.818
        self.assertAlmostEqual(ema10_step.iloc[10], 101.8181818, places=5)

    def test_sma_calculations(self):
        """Verify 50-day and 200-day SMA rolling windows."""
        # Create a series of length 250 with values 1 to 250
        prices = pd.Series(range(1, 251))
        
        sma50 = prices.rolling(window=50).mean()
        sma200 = prices.rolling(window=200).mean()
        
        # Check NaNs
        self.assertTrue(pd.isna(sma50.iloc[48]))
        self.assertFalse(pd.isna(sma50.iloc[49])) # 50th element (0-indexed 49)
        self.assertTrue(pd.isna(sma200.iloc[198]))
        self.assertFalse(pd.isna(sma200.iloc[199])) # 200th element (0-indexed 199)
        
        # Check value of 50-day SMA at index 49 (average of 1 to 50 = 25.5)
        self.assertEqual(sma50.iloc[49], 25.5)
        
        # Check value of 200-day SMA at index 199 (average of 1 to 200 = 100.5)
        self.assertEqual(sma200.iloc[199], 100.5)

if __name__ == "__main__":
    unittest.main()
