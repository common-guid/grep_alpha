import unittest
from src.yaml_manager import YAMLManager

class TestIBDTags(unittest.TestCase):
    def setUp(self):
        self.manager = YAMLManager("watchlists")
        self.allowed_tags = {
            "semiconductors",
            "software_internet",
            "infrastructure_industrials",
            "aerospace_space",
            "healthcare_biotech",
            "consumer_retail",
            "transportation_logistics",
            "energy_utilities",
            "financials",
            "diversified_etfs"
        }

    def validate_tags(self, category):
        data = self.manager.get_watchlist(category)
        self.assertIsNotNone(data)
        
        for ticker in data.get("tickers", []):
            symbol = ticker.get("symbol")
            tags_str = ticker.get("tags")
            
            # Ensure tags field is present and is not empty
            self.assertTrue(tags_str, f"Ticker {symbol} in {category} has missing or empty tags field")
            
            # Split tags by comma and strip whitespace
            tags_list = [t.strip() for t in tags_str.split(",") if t.strip()]
            
            # Ensure there is at least one tag
            self.assertGreaterEqual(len(tags_list), 1, f"Ticker {symbol} in {category} has no tags")
            
            # Ensure all tags are in the allowed set
            for tag in tags_list:
                self.assertIn(tag, self.allowed_tags, f"Ticker {symbol} in {category} has tag '{tag}', which is not in the allowed consolidated set: {self.allowed_tags}")

    def test_ibd_weekly_tags(self):
        """Verify that all tickers in IBD_weekly.yaml have tags from the consolidated set."""
        self.validate_tags("IBD_weekly")

    def test_idb_top_50_tags(self):
        """Verify that all tickers in IDB_top_50.yaml have tags from the consolidated set."""
        self.validate_tags("IDB_top_50")

if __name__ == "__main__":
    unittest.main()
