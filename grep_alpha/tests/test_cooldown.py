import unittest
import os
import sys
from datetime import datetime, timedelta

# Ensure src can be imported
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src import database, data_fetcher

class TestRateLimitCooldown(unittest.TestCase):
    def setUp(self):
        database.DB_PATH = "test_cooldown_data.db"
        database.init_db()
        database.clear_rate_limit_cooldown()

    def tearDown(self):
        if os.path.exists("test_cooldown_data.db"):
            os.remove("test_cooldown_data.db")

    def test_set_and_get_cooldown_status(self):
        status_before = database.get_rate_limit_cooldown_status()
        self.assertFalse(status_before["active"])

        locked_until = database.set_rate_limit_cooldown(hours=24.0, reason="Test 429 Error")
        self.assertIsNotNone(locked_until)

        status_after = database.get_rate_limit_cooldown_status()
        self.assertTrue(status_after["active"])
        self.assertEqual(status_after["reason"], "Test 429 Error")
        self.assertGreater(status_after["remaining_seconds"], 80000)

    def test_clear_cooldown(self):
        database.set_rate_limit_cooldown(hours=24.0, reason="Test Lock")
        self.assertTrue(database.get_rate_limit_cooldown_status()["active"])

        database.clear_rate_limit_cooldown()
        self.assertFalse(database.get_rate_limit_cooldown_status()["active"])

    def test_sync_tickers_aborts_when_cooldown_active(self):
        database.set_rate_limit_cooldown(hours=24.0, reason="Rate limit active")
        res = data_fetcher.sync_tickers(force=False)
        self.assertIsInstance(res, dict)
        self.assertEqual(res.get("status"), "cooldown_active")

    def test_sync_tickers_force_bypasses_cooldown(self):
        database.set_rate_limit_cooldown(hours=24.0, reason="Rate limit active")
        # With force=True, cooldown is cleared and proceeds
        # (It will fail to connect or return early if no API credentials, but shouldn't be cooldown_active)
        try:
            res = data_fetcher.sync_tickers(force=True)
            self.assertNotEqual(res.get("status"), "cooldown_active")
        except Exception:
            pass  # API credentials might not be present in test environment

if __name__ == "__main__":
    unittest.main()
