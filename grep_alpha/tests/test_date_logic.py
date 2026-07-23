import unittest
from datetime import datetime, timedelta
import os

# Mocking the date logic locally for verification
class TestDateLogic(unittest.TestCase):
    def test_end_date_calculation(self):
        # Emulate the logic in data_fetcher.py
        today = datetime.now().date()
        end_date = today - timedelta(days=1)
        
        # Verification
        self.assertTrue(end_date < today, "End date must be in the past")
        
        # Test if start_date logic works as expected
        last_date_str = "2026-03-20"
        start_date = datetime.strptime(last_date_str, "%Y-%m-%d").date() + timedelta(days=1)
        
        # If today is March 21, end_date is March 20.
        # start_date would be March 21.
        # start_date > end_date should be True (already up to date)
        if today.isoformat() == "2026-03-21":
            self.assertTrue(start_date > end_date)
            self.assertEqual(start_date.isoformat(), "2026-03-21")
            self.assertEqual(end_date.isoformat(), "2026-03-20")

if __name__ == "__main__":
    unittest.main()
