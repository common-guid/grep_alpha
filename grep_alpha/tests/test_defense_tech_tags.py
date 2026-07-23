import unittest
from src.yaml_manager import YAMLManager

class TestDefenseTechTags(unittest.TestCase):
    def setUp(self):
        self.manager = YAMLManager("watchlists")

    def test_defense_tech_tags_consolidated(self):
        """Verify that all tickers in defense_tech.yaml have one or more tags from the consolidated set."""
        data = self.manager.get_watchlist("defense_tech")
        self.assertIsNotNone(data)
        
        allowed_tags = {"defense", "aero", "drones", "space"}
        
        for ticker in data.get("tickers", []):
            symbol = ticker.get("symbol")
            tags_str = ticker.get("tags")
            
            # Ensure tags field is present and is not empty
            self.assertTrue(tags_str, f"Ticker {symbol} has missing or empty tags field")
            
            # Split tags by comma and strip whitespace
            tags_list = [t.strip() for t in tags_str.split(",") if t.strip()]
            
            # Ensure there is at least one tag
            self.assertGreaterEqual(len(tags_list), 1, f"Ticker {symbol} has no tags")
            
            # Ensure all tags are in the allowed set
            for tag in tags_list:
                self.assertIn(tag, allowed_tags, f"Ticker {symbol} has tag '{tag}', which is not in the allowed consolidated set: {allowed_tags}")

if __name__ == "__main__":
    unittest.main()
