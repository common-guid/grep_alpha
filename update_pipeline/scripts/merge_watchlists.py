#!/usr/bin/env python3
"""
merge_watchlists.py
Smart Merger Module for Watchlist Automation Pipeline.
Merges newly extracted ticker data into FlipCharts and grep_alpha watchlists without clobbering user state.
"""

import argparse
import datetime
import os
import shutil
import sys
import yaml

DEFAULT_EXTRACTED_PATH = "update_pipeline/scratch/extracted_tickers.yaml"
DEFAULT_FLIPCHARTS_PATH = "FlipCharts/watchlist.yaml"
DEFAULT_GREP_ALPHA_PATH = "grep_alpha/watchlists/IDB_top_50.yaml"
DEFAULT_BACKUPS_DIR = "update_pipeline/.backups"


def load_yaml(path: str):
    """Load YAML file or return empty fallback."""
    if not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def save_yaml(data, path: str):
    """Save data as clean YAML to path."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        yaml.dump(data, f, sort_keys=False, default_flow_style=False)


def create_backups(files: list[str], backup_dir: str) -> str:
    """Create timestamped backups for target files."""
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d_%H%M%S")
    target_backup_dir = os.path.join(backup_dir, timestamp)
    os.makedirs(target_backup_dir, exist_ok=True)

    for f_path in files:
        if os.path.exists(f_path):
            filename = os.path.basename(f_path)
            dest = os.path.join(target_backup_dir, filename)
            shutil.copy2(f_path, dest)
            print(f"Backed up {f_path} -> {dest}")

    return target_backup_dir


def normalize_tags(existing_tags_str: str, new_tags_str: str) -> str:
    """Combine and deduplicate comma-separated tags strings."""
    tags_set = []
    seen = set()

    for tags_src in [existing_tags_str, new_tags_str]:
        if not tags_src:
            continue
        parts = [t.strip() for t in str(tags_src).split(",") if t.strip()]
        for p in parts:
            if p.lower() not in seen:
                seen.add(p.lower())
                tags_set.append(p)

    return ", ".join(tags_set)


def merge_ticker_entry(existing_ticker: dict, extracted_ticker: dict) -> dict:
    """
    Merge new extracted ticker data into existing ticker entry.
    Preserves: status, target_entry, existing non-empty thesis.
    Merges: tags (appends missing tags).
    """
    symbol = existing_ticker.get("symbol", extracted_ticker.get("symbol")).upper()
    status = existing_ticker.get("status", extracted_ticker.get("status", "watching"))
    target_entry = existing_ticker.get("target_entry", extracted_ticker.get("target_entry", None))

    # Keep existing non-empty thesis, otherwise take newly extracted thesis
    existing_thesis = str(existing_ticker.get("thesis", "")).strip()
    new_thesis = str(extracted_ticker.get("thesis", "")).strip()
    final_thesis = existing_thesis if existing_thesis else new_thesis

    # Merge tags
    final_tags = normalize_tags(existing_ticker.get("tags", ""), extracted_ticker.get("tags", ""))

    return {
        "symbol": symbol,
        "status": status,
        "target_entry": target_entry,
        "thesis": final_thesis,
        "tags": final_tags
    }


def merge_flipcharts_watchlist(existing_data: list, extracted_data: dict) -> list:
    """Merge into FlipCharts watchlist (list of ticker objects)."""
    existing_map = {}
    if isinstance(existing_data, list):
        for item in existing_data:
            if isinstance(item, dict) and "symbol" in item:
                existing_map[item["symbol"].upper()] = item

    new_tickers_dict = extracted_data.get("tickers", [])
    merged_list = []
    processed_symbols = set()

    # First update existing entries in order
    if isinstance(existing_data, list):
        for item in existing_data:
            sym = item.get("symbol", "").upper()
            if not sym:
                continue
            if sym in new_tickers_dict_by_symbol(new_tickers_dict):
                ext = new_tickers_dict_by_symbol(new_tickers_dict)[sym]
                merged_entry = merge_ticker_entry(item, ext)
            else:
                merged_entry = item
            merged_list.append(merged_entry)
            processed_symbols.add(sym)

    # Append completely new extracted tickers
    for ext in new_tickers_dict:
        sym = ext.get("symbol", "").upper()
        if sym and sym not in processed_symbols:
            merged_list.append({
                "symbol": sym,
                "status": "watching",
                "target_entry": None,
                "thesis": str(ext.get("thesis", "")).strip(),
                "tags": str(ext.get("tags", "")).strip()
            })
            processed_symbols.add(sym)

    return merged_list


def merge_grep_alpha_watchlist(existing_data: dict, extracted_data: dict) -> dict:
    """Merge into grep_alpha IDB top 50 watchlist (dict with name, updated, tickers)."""
    today_str = datetime.date.today().strftime("%Y-%m-%d")
    existing_tickers = existing_data.get("tickers", []) if isinstance(existing_data, dict) else []

    merged_tickers = merge_flipcharts_watchlist(existing_tickers, extracted_data)

    return {
        "name": existing_data.get("name", "ibd top 50") if isinstance(existing_data, dict) else "ibd top 50",
        "updated": today_str,
        "tickers": merged_tickers
    }


def new_tickers_dict_by_symbol(tickers_list: list) -> dict:
    return {t["symbol"].upper(): t for t in tickers_list if isinstance(t, dict) and "symbol" in t}


def main():
    parser = argparse.ArgumentParser(description="Smart Merger for Watchlist Automation Pipeline")
    parser.add_argument("--extracted", type=str, default=DEFAULT_EXTRACTED_PATH, help=f"Extracted tickers YAML path (default: {DEFAULT_EXTRACTED_PATH})")
    parser.add_argument("--flipcharts-path", type=str, default=DEFAULT_FLIPCHARTS_PATH, help=f"FlipCharts YAML path (default: {DEFAULT_FLIPCHARTS_PATH})")
    parser.add_argument("--grep-alpha-path", type=str, default=DEFAULT_GREP_ALPHA_PATH, help=f"grep_alpha YAML path (default: {DEFAULT_GREP_ALPHA_PATH})")
    parser.add_argument("--backups-dir", type=str, default=DEFAULT_BACKUPS_DIR, help=f"Backups directory (default: {DEFAULT_BACKUPS_DIR})")
    parser.add_argument("--dry-run", action="store_true", help="Calculate merge results without writing changes or backups")
    parser.add_argument("--test-merge", action="store_true", help="Run self-test on merge logic")

    args = parser.parse_args()

    if args.test_merge:
        print("Running merge logic self-tests...")
        existing = {"symbol": "AAPL", "status": "core_holding", "target_entry": 170.0, "thesis": "My custom thesis", "tags": "Big_Tech"}
        extracted = {"symbol": "AAPL", "status": "watching", "target_entry": None, "thesis": "New extracted thesis", "tags": "Software, AI_Adjacent"}
        merged = merge_ticker_entry(existing, extracted)
        assert merged["status"] == "core_holding", f"Status clobbered! {merged}"
        assert merged["target_entry"] == 170.0, f"Target entry clobbered! {merged}"
        assert merged["thesis"] == "My custom thesis", f"Thesis clobbered! {merged}"
        assert "Big_Tech" in merged["tags"] and "Software" in merged["tags"], f"Tags missing! {merged}"
        print("Merge logic self-test PASSED!")
        sys.exit(0)

    print(f"Loading extracted data from: {args.extracted}")
    extracted_data = load_yaml(args.extracted)
    if not extracted_data or "tickers" not in extracted_data:
        print("Error: Extracted data is missing or invalid.")
        sys.exit(1)

    print(f"Loading FlipCharts watchlist: {args.flipcharts_path}")
    flipcharts_existing = load_yaml(args.flipcharts_path)

    print(f"Loading grep_alpha watchlist: {args.grep_alpha_path}")
    grep_alpha_existing = load_yaml(args.grep_alpha_path)

    flipcharts_merged = merge_flipcharts_watchlist(flipcharts_existing, extracted_data)
    grep_alpha_merged = merge_grep_alpha_watchlist(grep_alpha_existing, extracted_data)

    print(f"\n--- MERGE SUMMARY ---")
    print(f"FlipCharts Tickers: {len(flipcharts_existing) if flipcharts_existing else 0} -> {len(flipcharts_merged)}")
    print(f"grep_alpha Tickers: {len(grep_alpha_existing.get('tickers', [])) if grep_alpha_existing else 0} -> {len(grep_alpha_merged['tickers'])}")

    if args.dry_run:
        print("\n[DRY RUN] No files written or backed up.")
    else:
        print("\nCreating backups...")
        backup_dir = create_backups([args.flipcharts_path, args.grep_alpha_path], args.backups_dir)
        print(f"Saved backups to {backup_dir}")

        print("Writing merged watchlists...")
        save_yaml(flipcharts_merged, args.flipcharts_path)
        print(f"Updated FlipCharts watchlist -> {args.flipcharts_path}")

        save_yaml(grep_alpha_merged, args.grep_alpha_path)
        print(f"Updated grep_alpha watchlist -> {args.grep_alpha_path}")

        print("\nSUCCESS: All watchlists updated cleanly!")


if __name__ == "__main__":
    main()
