import unittest
import os
import sqlite3
import runpy
import tempfile
from unittest.mock import patch
from src import database

class TestDatabase(unittest.TestCase):
    def setUp(self):
        # Use a separate test database
        self.original_db_path = database.DB_PATH
        self.temp_dir = tempfile.TemporaryDirectory()
        database.DB_PATH = os.path.join(self.temp_dir.name, "test_data.db")
        database.init_db()

    def tearDown(self):
        database.DB_PATH = self.original_db_path
        self.temp_dir.cleanup()

    def test_db_path_environment_override(self):
        path = os.path.join(self.temp_dir.name, "configured", "data.db")
        with patch.dict(os.environ, {"DB_PATH": path}):
            config = runpy.run_path(database.__file__)
        self.assertEqual(config["DB_PATH"], path)

    def test_default_db_path(self):
        with patch.dict(os.environ):
            os.environ.pop("DB_PATH", None)
            config = runpy.run_path(database.__file__)
        workspace_root = os.path.dirname(os.path.dirname(os.path.dirname(database.__file__)))
        self.assertEqual(config["DB_PATH"], os.path.join(workspace_root, "data.db"))

    def test_init_db_creates_parent_directory(self):
        database.DB_PATH = os.path.join(self.temp_dir.name, "data", "nested", "data.db")
        database.init_db()
        self.assertTrue(os.path.isfile(database.DB_PATH))
        self.test_init_db()

    def test_init_db_preserves_existing_prices(self):
        database.insert_daily_prices([
            ("2023-01-01", "AAPL", 150.0, 155.0, 149.0, 153.0, 1000),
        ])
        database.init_db()
        self.assertEqual(database.get_last_updated_date("AAPL"), "2023-01-01")

    def test_init_db(self):
        with database.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='daily_prices'")
            self.assertIsNotNone(cursor.fetchone())

    def test_chart_drawings_table_exists_after_init(self):
        with database.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='chart_drawings'")
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
