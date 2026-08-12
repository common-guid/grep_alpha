import yaml
import os
from typing import List, Dict, Any, Optional

class YAMLManager:
    def __init__(self, watchlists_dir: Optional[str] = None):
        if watchlists_dir is None:
            if os.path.exists("watchlists") and any(f.endswith((".yml", ".yaml")) for f in os.listdir("watchlists")):
                watchlists_dir = "watchlists"
            elif os.path.exists("grep_alpha/watchlists") and any(f.endswith((".yml", ".yaml")) for f in os.listdir("grep_alpha/watchlists")):
                watchlists_dir = "grep_alpha/watchlists"
            else:
                _src_dir = os.path.dirname(os.path.abspath(__file__))
                _pkg_dir = os.path.dirname(_src_dir)
                _candidate = os.path.join(_pkg_dir, "watchlists")
                if os.path.exists(_candidate):
                    watchlists_dir = _candidate
                else:
                    watchlists_dir = "watchlists"
        self.watchlists_dir = watchlists_dir
        if not os.path.exists(self.watchlists_dir):
            os.makedirs(self.watchlists_dir)


    def _get_path(self, category: str) -> str:
        # Check for both .yml and .yaml
        yml_path = os.path.join(self.watchlists_dir, f"{category}.yml")
        yaml_path = os.path.join(self.watchlists_dir, f"{category}.yaml")
        
        if os.path.exists(yml_path):
            return yml_path
        if os.path.exists(yaml_path):
            return yaml_path
        
        # Default to .yml for new files
        return yml_path

    def list_watchlists(self) -> List[str]:
        """Returns a list of all watchlist category names (filenames without .yml or .yaml)."""
        files = [f for f in os.listdir(self.watchlists_dir) if f.endswith(".yml") or f.endswith(".yaml")]
        return [f.rsplit('.', 1)[0] for f in files]

    def get_watchlist(self, category: str) -> Dict[str, Any]:
        """Reads a specific watchlist and returns its data."""
        path = self._get_path(category)
        if not os.path.exists(path):
            raise FileNotFoundError(f"Watchlist '{category}' not found at {path}")
        
        with open(path, "r") as f:
            data = yaml.safe_load(f) or {}
            if "tickers" not in data:
                data["tickers"] = []
            return data

    def save_watchlist(self, category: str, data: Dict[str, Any]):
        """Saves data back to the watchlist file."""
        path = self._get_path(category)
        with open(path, "w") as f:
            yaml.dump(data, f, sort_keys=False)

    def add_ticker(self, category: str, ticker: str, thesis: str = "", status: str = "watching"):
        """Adds a new ticker to a specific watchlist."""
        try:
            data = self.get_watchlist(category)
        except FileNotFoundError:
            # Create a new watchlist if it doesn't exist
            data = {"name": category.capitalize(), "tickers": []}
        
        # Check if ticker already exists
        for item in data["tickers"]:
            if item["symbol"].upper() == ticker.upper():
                return  # Ticker already exists
        
        new_entry = {
            "symbol": ticker.upper(),
            "status": status,
            "thesis": thesis
        }
        data["tickers"].append(new_entry)
        self.save_watchlist(category, data)

    def remove_ticker(self, category: str, ticker: str):
        """Removes a ticker from a specific watchlist."""
        data = self.get_watchlist(category)
        original_count = len(data["tickers"])
        data["tickers"] = [item for item in data["tickers"] if item["symbol"].upper() != ticker.upper()]
        
        if len(data["tickers"]) < original_count:
            self.save_watchlist(category, data)

    def update_thesis(self, category: str, ticker: str, thesis: str):
        """Updates the thesis for a specific ticker in a watchlist."""
        data = self.get_watchlist(category)
        updated = False
        for item in data["tickers"]:
            if item["symbol"].upper() == ticker.upper():
                item["thesis"] = thesis
                updated = True
                break
        
        if updated:
            self.save_watchlist(category, data)
        else:
            # If ticker doesn't exist, we could add it, but for now let's just raise an error or ignore
            pass
