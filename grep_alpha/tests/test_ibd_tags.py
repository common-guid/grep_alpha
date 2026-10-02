import os
import unittest

from src.yaml_manager import YAMLManager

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TAXONOMY_PATH = os.path.join(REPO_ROOT, "available-tags.md")


def load_canonical_tags():
    """Single source of truth: the approved taxonomy file itself."""
    tags = set()
    with open(TAXONOMY_PATH) as fh:
        for line in fh:
            line = line.strip()
            if line and not line.startswith("#") and " - " in line:
                tags.add(line.split(" - ")[0].strip())
    return tags


class TestIBDTags(unittest.TestCase):
    """Watchlist tags must exist in available-tags.md (prevents taxonomy drift)."""

    def setUp(self):
        self.manager = YAMLManager("grep_alpha/watchlists")
        self.allowed_tags = load_canonical_tags()
        self.assertGreater(len(self.allowed_tags), 20,
                           f"Taxonomy file {TAXONOMY_PATH} parsed suspiciously small")

    def validate_tags(self, category):
        data = self.manager.get_watchlist(category)
        self.assertIsNotNone(data)

        for ticker in data.get("tickers", []):
            symbol = ticker.get("symbol")
            tags_str = ticker.get("tags")

            # Ensure tags field is present and is not empty
            self.assertTrue(tags_str, f"Ticker {symbol} in {category} has missing or empty tags field")

            tags_list = [t.strip() for t in tags_str.split(",") if t.strip()]

            self.assertGreaterEqual(len(tags_list), 1, f"Ticker {symbol} in {category} has no tags")

            for tag in tags_list:
                self.assertIn(tag, self.allowed_tags,
                              f"Ticker {symbol} in {category} has tag '{tag}', "
                              f"which is not in available-tags.md. "
                              f"Fix the tag or add the tag to the taxonomy.")

    def test_ibd_weekly_tags(self):
        """All tickers in IBD_weekly.yaml carry only taxonomy-approved tags."""
        self.validate_tags("IBD_weekly")

    def test_idb_top_50_tags(self):
        """All tickers in IDB_top_50.yaml carry only taxonomy-approved tags."""
        self.validate_tags("IDB_top_50")


if __name__ == "__main__":
    unittest.main()
