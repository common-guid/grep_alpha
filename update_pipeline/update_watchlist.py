#!/usr/bin/env python3
"""
update_watchlist.py
Master CLI Entry Point for Unified Watchlist Automation Pipeline.
Orchestrates Ingestion (fetch_transcripts) -> Extraction (run_agent_extraction) -> Merger (merge_watchlists).
"""

import argparse
import os
import subprocess
import sys

SCRIPTS_DIR = os.path.join(os.path.dirname(__file__), "scripts")
FETCH_SCRIPT = os.path.join(SCRIPTS_DIR, "fetch_transcripts.py")
EXTRACT_SCRIPT = os.path.join(SCRIPTS_DIR, "run_agent_extraction.py")
MERGE_SCRIPT = os.path.join(SCRIPTS_DIR, "merge_watchlists.py")

SCRATCH_TRANSCRIPT_PATH = "update_pipeline/scratch/transcripts_weekly.txt"
SCRATCH_EXTRACTED_PATH = "update_pipeline/scratch/extracted_tickers.yaml"


def run_step(cmd_args: list[str], step_name: str):
    """Execute a python pipeline step command."""
    print(f"\n==================================================")
    print(f"▶ STEP: {step_name}")
    print(f"Executing: {' '.join(cmd_args)}")
    print(f"==================================================")

    res = subprocess.run(cmd_args)
    if res.returncode != 0:
        print(f"\n❌ ERROR in step '{step_name}'. Exit code: {res.returncode}")
        sys.exit(res.returncode)


def main():
    parser = argparse.ArgumentParser(description="Unified Watchlist Automation Pipeline Master CLI")
    parser.add_argument("--url", "--urls", type=str, help="Comma-separated YouTube video URLs or Video IDs")
    parser.add_argument("--auto-ibd", action="store_true", help="Auto-fetch recent Stock Market Today videos from IBD channel")
    parser.add_argument("--days", type=int, default=7, help="Number of days to look back for --auto-ibd (default: 7)")
    parser.add_argument("--dry-run", action="store_true", help="Run end-to-end pipeline in dry-run mode without updating watchlists")

    args = parser.parse_args()

    if not args.url and not args.auto_ibd:
        parser.print_help()
        print("\nError: Must specify either --urls 'URL1,URL2' or --auto-ibd")
        sys.exit(1)

    python_bin = sys.executable

    # --------------------------------------------------
    # Step 1: Ingestion / Transcript Scraping
    # --------------------------------------------------
    fetch_cmd = [python_bin, FETCH_SCRIPT, "--out", SCRATCH_TRANSCRIPT_PATH]
    if args.url:
        fetch_cmd.extend(["--url", args.url])
    elif args.auto_ibd:
        fetch_cmd.extend(["--auto-ibd", "--days", str(args.days)])

    run_step(fetch_cmd, "1. Fetch YouTube Transcripts")

    # --------------------------------------------------
    # Step 2: Extraction via Gemini / Antigravity Agent
    # --------------------------------------------------
    extract_cmd = [python_bin, EXTRACT_SCRIPT, "--input", SCRATCH_TRANSCRIPT_PATH, "--out", SCRATCH_EXTRACTED_PATH]
    run_step(extract_cmd, "2. Extract Tickers & Theses via Gemini Agent")

    # --------------------------------------------------
    # Step 3: Smart Merge into Watchlists
    # --------------------------------------------------
    merge_cmd = [python_bin, MERGE_SCRIPT, "--extracted", SCRATCH_EXTRACTED_PATH]
    if args.dry_run:
        merge_cmd.append("--dry-run")

    run_step(merge_cmd, "3. Smart Merge into FlipCharts & grep_alpha Watchlists")

    print("\n🎉 PIPELINE EXECUTION COMPLETE!")


if __name__ == "__main__":
    main()
