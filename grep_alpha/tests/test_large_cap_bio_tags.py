import unittest
from src.yaml_manager import YAMLManager

class TestLargeCapBioTags(unittest.TestCase):
    def setUp(self):
        self.manager = YAMLManager("watchlists")

    def test_large_cap_bio_tags_consolidated(self):
        """Verify that all tickers in large_cap_bio.yaml have tags from the consolidated set."""
        data = self.manager.get_watchlist("large_cap_bio")
        self.assertIsNotNone(data)
        
        allowed_tags = {"oncology", "immunology", "specialty_care"}
        
        for ticker in data.get("tickers", []):
            symbol = ticker.get("symbol")
            tags_str = ticker.get("tags")
            
            # Ensure tags field is present and is not empty
            self.assertTrue(tags_str, f"Ticker {symbol} has missing or empty tags field")
            
            # Split tags by comma and strip whitespace
            tags_list = [t.strip() for t in tags_str.split(",") if t.strip()]
            
            # Ensure all tags are in the allowed set
            for tag in tags_list:
                self.assertIn(tag, allowed_tags, f"Ticker {symbol} has tag '{tag}', which is not in the allowed consolidated set: {allowed_tags}")

if __name__ == "__main__":
    unittest.main()
