import unittest
import os
import sqlite3
from src import database, analytics

class TestDBErrorFix(unittest.TestCase):
    def setUp(self):
        # Use a non-existent DB path
        self.test_db = "non_existent.db"
        database.DB_PATH = self.test_db
        if os.path.exists(self.test_db):
            os.remove(self.test_db)

    def tearDown(self):
        if os.path.exists(self.test_db):
            os.remove(self.test_db)

    def test_calculate_indices_initializes_db(self):
        # Even if DB doesn't exist, this should not crash with "no such table"
        # but just return empty df because there's no data.
        try:
            df = analytics.calculate_indices(["AAPL"], "3m")
            self.assertTrue(df.empty)
            # Verify table was created
            with sqlite3.connect(self.test_db) as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='daily_prices'")
                self.assertIsNotNone(cursor.fetchone())
        except Exception as e:
            self.fail(f"calculate_indices failed on uninitialized DB: {e}")

    def test_get_price_data_initializes_db(self):
        # Even if DB doesn't exist, this should not crash
        try:
            data = database.get_price_data("AAPL", "2023-01-01")
            self.assertEqual(data, [])
            # Verify table was created
            with sqlite3.connect(self.test_db) as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='daily_prices'")
                self.assertIsNotNone(cursor.fetchone())
        except Exception as e:
            self.fail(f"get_price_data failed on uninitialized DB: {e}")

if __name__ == "__main__":
    unittest.main()
