#!/usr/bin/env python3
"""
fetch_transcripts.py
Ingestion module for Watchlist Automation Pipeline.
Fetches YouTube transcripts via youtube-transcript-api with 3-tier fallback and RSS channel discovery.
"""

import argparse
import datetime
import os
import re
import sys
import xml.etree.ElementTree as ET
import requests
from youtube_transcript_api import YouTubeTranscriptApi

IBD_CHANNEL_ID = "UC5fZv7bPcF5j2RsfO-9OiLA"
DEFAULT_SCRATCH_PATH = "update_pipeline/scratch/transcripts_weekly.txt"


def extract_video_id(url_or_id: str) -> str:
    """Extract 11-character YouTube video ID from URL or return raw ID."""
    url_or_id = url_or_id.strip()
    match = re.search(r"(?:v=|\/shorts\/|\/embed\/|youtu\.be\/|^)([a-zA-Z0-9_-]{11})(?:[?&]|$)", url_or_id)
    if match:
        return match.group(1)
    if len(url_or_id) == 11:
        return url_or_id
    raise ValueError(f"Invalid YouTube URL or Video ID: {url_or_id}")


def fetch_ibd_recent_videos(days: int = 7) -> list[dict]:
    """Fetch videos from IBD YouTube channel RSS feed or web scraper fallback."""
    rss_url = f"https://www.youtube.com/feeds/videos.xml?channel_id={IBD_CHANNEL_ID}"
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"}
    
    videos = []
    cutoff_date = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=days)

    try:
        resp = requests.get(rss_url, headers=headers, timeout=10)
        if resp.status_code == 200:
            root = ET.fromstring(resp.content)
            entries = root.findall("{http://www.w3.org/2005/Atom}entry")
            for entry in entries:
                title = entry.find("{http://www.w3.org/2005/Atom}title").text or ""
                link = entry.find("{http://www.w3.org/2005/Atom}link").attrib.get("href", "")
                published_str = entry.find("{http://www.w3.org/2005/Atom}published").text or ""

                if "/shorts/" in link:
                    continue

                try:
                    pub_date = datetime.datetime.fromisoformat(published_str)
                except ValueError:
                    pub_date = datetime.datetime.now(datetime.timezone.utc)

                if pub_date >= cutoff_date:
                    vid = extract_video_id(link)
                    videos.append({
                        "video_id": vid,
                        "title": title,
                        "link": link,
                        "published": published_str[:10]
                    })
            if videos:
                return videos
    except Exception as e:
        print(f"Notice: RSS feed fetch failed ({e}). Falling back to web channel scraper...")

    # Fallback: Web page scraper
    web_url = "https://www.youtube.com/@investorsbusinessdaily/videos"
    try:
        resp = requests.get(web_url, headers=headers, timeout=10)
        resp.raise_for_status()
        vids = re.findall(r'\"videoId\":\"([a-zA-Z0-9_-]{11})\"', resp.text)
        seen = set()
        for vid in vids:
            if vid not in seen:
                seen.add(vid)
                videos.append({
                    "video_id": vid,
                    "title": f"IBD Video {vid}",
                    "link": f"https://www.youtube.com/watch?v={vid}",
                    "published": datetime.date.today().strftime("%Y-%m-%d")
                })
                if len(videos) >= 5: # Limit to top 5 recent videos for fallback scan
                    break
    except Exception as err:
        print(f"Error scraping web channel page: {err}")

    return videos


def get_transcript_text(video_id: str) -> tuple[str, str]:
    """
    Fetch transcript using 3-tier fallback.
    Returns (transcript_text, method_used).
    """
    # Tier 1: youtube-transcript-api
    try:
        api = YouTubeTranscriptApi()
        transcript = api.fetch(video_id)
        text_lines = [item.text for item in transcript]
        return " ".join(text_lines), "youtube-transcript-api (Tier 1)"
    except Exception as e:
        tier1_error = str(e)

    # Tier 2: yt-dlp fallback if installed
    try:
        import subprocess
        cmd = [
            "yt-dlp",
            "--write-auto-sub",
            "--sub-lang", "en",
            "--skip-download",
            "--print", "%(subtitles)s",
            f"https://www.youtube.com/watch?v={video_id}"
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
        if result.returncode == 0 and result.stdout:
            return result.stdout.strip(), "yt-dlp (Tier 2)"
    except Exception:
        pass

    # Tier 3: Fallback notice
    return (
        f"[TRANSCRIPT UNAVAILABLE via Scraper: {tier1_error}. Audio transcription required]",
        "Failed / Requires Tier 3 Audio S2T"
    )


def process_transcripts(video_list: list[dict], output_path: str):
    """Fetch transcripts for a list of video dicts and write aggregated file."""
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    aggregated_blocks = []

    print(f"Processing transcripts for {len(video_list)} videos...")
    for idx, vid in enumerate(video_list, 1):
        v_id = vid["video_id"]
        title = vid.get("title", f"Video {v_id}")
        pub_date = vid.get("published", "Unknown Date")
        link = vid.get("link", f"https://www.youtube.com/watch?v={v_id}")

        print(f"[{idx}/{len(video_list)}] Fetching transcript for: {title} ({v_id})...")
        text, method = get_transcript_text(v_id)

        block = (
            f"==================================================\n"
            f"VIDEO TITLE: {title}\n"
            f"PUBLISHED DATE: {pub_date}\n"
            f"URL: {link}\n"
            f"EXTRACTION METHOD: {method}\n"
            f"==================================================\n\n"
            f"{text}\n\n"
        )
        aggregated_blocks.append(block)

    full_output = "\n".join(aggregated_blocks)
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(full_output)

    print(f"\nSUCCESS: Aggregated transcript written to {output_path}")
    print(f"Total Output Length: {len(full_output)} characters across {len(video_list)} video(s).")


def main():
    parser = argparse.ArgumentParser(description="Fetch YouTube transcripts for Watchlist Automation Pipeline")
    parser.add_argument("--url", "--urls", type=str, help="Comma-separated YouTube URLs or Video IDs")
    parser.add_argument("--auto-ibd", action="store_true", help="Auto-fetch recent videos from IBD YouTube channel")
    parser.add_argument("--days", type=int, default=7, help="Number of days to look back for --auto-ibd (default: 7)")
    parser.add_argument("--out", type=str, default=DEFAULT_SCRATCH_PATH, help=f"Output transcript path (default: {DEFAULT_SCRATCH_PATH})")
    parser.add_argument("--test", action="store_true", help="Run quick self-test")

    args = parser.parse_args()

    if args.test:
        print("Self-test mode: testing extract_video_id and API imports...")
        vid = extract_video_id("https://www.youtube.com/watch?v=_5QWaxxVI1I")
        assert vid == "_5QWaxxVI1I", f"Failed video ID extraction: {vid}"
        print("Self-test passed!")
        sys.exit(0)

    video_list = []

    if args.url:
        urls = [u.strip() for u in args.url.split(",") if u.strip()]
        for u in urls:
            v_id = extract_video_id(u)
            video_list.append({"video_id": v_id, "title": f"User Video {v_id}", "link": f"https://www.youtube.com/watch?v={v_id}"})

    elif args.auto_ibd:
        print(f"Scanning IBD YouTube channel (UC5fZv7bPcF5j2RsfO-9OiLA) for videos in last {args.days} days...")
        video_list = fetch_ibd_recent_videos(days=args.days)
        print(f"Found {len(video_list)} relevant videos.")

    else:
        parser.print_help()
        sys.exit(1)

    if not video_list:
        print("No videos found to process.")
        sys.exit(0)

    process_transcripts(video_list, args.out)


if __name__ == "__main__":
    main()
