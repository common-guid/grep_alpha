import unittest
import os
import sqlite3
from src import database

class TestDatabase(unittest.TestCase):
    def setUp(self):
        # Use a separate test database
        database.DB_PATH = "test_data.db"
        database.init_db()

    def tearDown(self):
        if os.path.exists("test_data.db"):
            os.remove("test_data.db")

    def test_init_db(self):
        with database.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='daily_prices'")
            self.assertIsNotNone(cursor.fetchone())

    def test_insert_and_get_last_date(self):
        data = [
            ("2023-01-01", "AAPL", 150.0, 155.0, 149.0, 153.0, 1000),
            ("2023-01-02", "AAPL", 153.0, 158.0, 152.0, 157.0, 1100),
        ]
        database.insert_daily_prices(data)
        last_date = database.get_last_updated_date("AAPL")
        self.assertEqual(last_date, "2023-01-02")

    def test_get_last_date_none(self):
        last_date = database.get_last_updated_date("MSFT")
        self.assertIsNone(last_date)

if __name__ == "__main__":
    unittest.main()
