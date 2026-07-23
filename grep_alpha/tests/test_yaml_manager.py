import os
import shutil
import unittest
from src.yaml_manager import YAMLManager

class TestYAMLManager(unittest.TestCase):
    def setUp(self):
        self.test_dir = "test_watchlists"
        self.manager = YAMLManager(self.test_dir)
        # Create a sample file
        with open(os.path.join(self.test_dir, "test.yml"), "w") as f:
            f.write("name: Test\ntickers:\n  - symbol: AAPL\n    thesis: test thesis\n")

    def tearDown(self):
        if os.path.exists(self.test_dir):
            shutil.rmtree(self.test_dir)

    def test_list_watchlists(self):
        self.assertEqual(self.manager.list_watchlists(), ["test"])

    def test_get_watchlist(self):
        data = self.manager.get_watchlist("test")
        self.assertEqual(data["name"], "Test")
        self.assertEqual(data["tickers"][0]["symbol"], "AAPL")

    def test_add_ticker(self):
        self.manager.add_ticker("test", "MSFT", "new thesis")
        data = self.manager.get_watchlist("test")
        symbols = [t["symbol"] for t in data["tickers"]]
        self.assertIn("MSFT", symbols)

    def test_remove_ticker(self):
        self.manager.remove_ticker("test", "AAPL")
        data = self.manager.get_watchlist("test")
        symbols = [t["symbol"] for t in data["tickers"]]
        self.assertNotIn("AAPL", symbols)

    def test_update_thesis(self):
        self.manager.update_thesis("test", "AAPL", "updated thesis")
        data = self.manager.get_watchlist("test")
        self.assertEqual(data["tickers"][0]["thesis"], "updated thesis")

if __name__ == "__main__":
    unittest.main()
