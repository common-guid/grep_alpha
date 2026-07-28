#!/usr/bin/env python3
"""
run_agent_extraction.py
Extractor module for Watchlist Automation Pipeline.
Passes video transcripts + tag taxonomy rules to Gemini / Antigravity Agent to produce structured YAML watchlist data.
"""

import argparse
import datetime
import json
import os
import sys
import yaml
import requests

DEFAULT_TRANSCRIPT_PATH = "update_pipeline/scratch/transcripts_weekly.txt"
DEFAULT_TAGS_PATH = "available-tags.md"
DEFAULT_OUTPUT_PATH = "update_pipeline/scratch/extracted_tickers.yaml"


def load_file(path: str) -> str:
    """Read and return content of a text file."""
    if not os.path.exists(path):
        raise FileNotFoundError(f"File not found: {path}")
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def call_gemini_extraction(transcript_text: str, tags_guidelines: str) -> list[dict]:
    """Call Gemini API with structured prompt to extract tickers, tags, and theses."""
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY environment variable is missing.")

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"

    # Keep prompt focused and concise for high response speed
    max_chars = 200000
    if len(transcript_text) > max_chars:
        print(f"Truncating transcript from {len(transcript_text)} to {max_chars} chars for fast processing...")
        transcript_text = transcript_text[:max_chars]

    prompt = f"""
You are an expert institutional financial analyst. Your task is to analyze the provided YouTube transcripts from Investor's Business Daily (IBD) and extract all stock tickers discussed, along with their business tags and investment theses.

--- AVAILABLE TAG TAXONOMY ---
{tags_guidelines}

--- OUTPUT CONSTRAINTS ---
Return a JSON array of ticker objects. Each object MUST adhere strictly to the following schema:
- symbol: The uppercase ticker symbol (e.g. "NVDA", "AAPL", "CAVA").
- status: Always "watching"
- target_entry: Always null
- tags: A comma-separated string containing AT LEAST TWO descriptive tags matching the taxonomy above or general business keywords (e.g. "Big_Tech, Software, AI_Adjacent").
- thesis:
  - If, and ONLY IF, the video context or your institutional knowledge provides a specific, data-driven investment thesis explaining why this ticker is in focus / likely to outperform, enter that thesis here.
  - Otherwise, you MUST leave this as an empty string ("").

--- INPUT TRANSCRIPTS ---
{transcript_text}

Return ONLY valid JSON matching the array of ticker objects. No markdown formatting outside JSON.
"""

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "responseMimeType": "application/json",
            "temperature": 0.2
        }
    }

    max_retries = 3
    timeout_seconds = 180

    for attempt in range(1, max_retries + 1):
        try:
            print(f"Calling Gemini API (Attempt {attempt}/{max_retries}, timeout={timeout_seconds}s)...")
            resp = requests.post(url, json=payload, timeout=timeout_seconds)
            resp.raise_for_status()

            result = resp.json()
            raw_json_str = result["candidates"][0]["content"]["parts"][0]["text"]
            tickers = json.loads(raw_json_str)
            return tickers
        except (requests.exceptions.ReadTimeout, requests.exceptions.RequestException) as err:
            print(f"Warning: Gemini API request attempt {attempt} failed: {err}")
            if attempt == max_retries:
                raise err

    raise RuntimeError("Failed to extract tickers from Gemini API after retries.")


def validate_and_format_watchlist(tickers_raw: list[dict]) -> dict:
    """Validate extracted tickers and build standard watchlist dictionary."""
    today_str = datetime.date.today().strftime("%Y-%m-%d")
    validated_tickers = []
    seen_symbols = set()

    for item in tickers_raw:
        sym = str(item.get("symbol", "")).strip().upper()
        if not sym or sym in seen_symbols:
            continue
        seen_symbols.add(sym)

        tags = item.get("tags", "")
        if isinstance(tags, list):
            tags = ", ".join(tags)

        ticker_obj = {
            "symbol": sym,
            "status": "watching",
            "target_entry": None,
            "thesis": str(item.get("thesis", "")).strip(),
            "tags": str(tags).strip()
        }
        validated_tickers.append(ticker_obj)

    # Sort alphabetically by symbol
    validated_tickers.sort(key=lambda x: x["symbol"])

    watchlist = {
        "name": "ibd top 50",
        "updated": today_str,
        "tickers": validated_tickers
    }
    return watchlist


def main():
    parser = argparse.ArgumentParser(description="Extract tickers and theses from video transcripts")
    parser.add_argument("--input", type=str, default=DEFAULT_TRANSCRIPT_PATH, help=f"Path to input transcripts (default: {DEFAULT_TRANSCRIPT_PATH})")
    parser.add_argument("--tags-file", type=str, default=DEFAULT_TAGS_PATH, help=f"Path to available-tags.md (default: {DEFAULT_TAGS_PATH})")
    parser.add_argument("--out", type=str, default=DEFAULT_OUTPUT_PATH, help=f"Output YAML path (default: {DEFAULT_OUTPUT_PATH})")
    parser.add_argument("--dry-run", action="store_true", help="Print extracted YAML to stdout without writing to file")

    args = parser.parse_args()

    print(f"Loading transcripts from: {args.input}")
    transcript_text = load_file(args.input)

    print(f"Loading tag guidelines from: {args.tags_file}")
    tags_guidelines = load_file(args.tags_file) if os.path.exists(args.tags_file) else "Big_Tech, Software, AI_Adjacent, Bio, Pharma, Semi-IDM, Semi-Fabless, Network"

    print("Calling Gemini extraction agent...")
    raw_tickers = call_gemini_extraction(transcript_text, tags_guidelines)
    print(f"Successfully extracted {len(raw_tickers)} raw ticker candidates.")

    watchlist = validate_and_format_watchlist(raw_tickers)
    yaml_output = yaml.dump(watchlist, sort_keys=False, default_flow_style=False)

    if args.dry_run:
        print("\n--- DRY RUN OUTPUT ---")
        print(yaml_output[:1000])
        print(f"... ({len(watchlist['tickers'])} total tickers)")
    else:
        os.makedirs(os.path.dirname(args.out), exist_ok=True)
        with open(args.out, "w", encoding="utf-8") as f:
            f.write(yaml_output)
        print(f"\nSUCCESS: Extracted YAML saved to {args.out}")


if __name__ == "__main__":
    main()
