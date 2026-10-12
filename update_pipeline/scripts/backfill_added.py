#!/usr/bin/env python3
"""
backfill_added.py

One-off backfill of the frozen `added` (first-seen) date in FlipCharts/watchlist.yaml
from git history: for each symbol, the commit date (YYYY-MM-DD, committer date in UTC)
of the oldest commit whose watchlist.yaml contains `- symbol: <SYM>`.

- Entries that already have `added` are left alone (idempotent, safe to re-run after a
  conflicting merge such as an automated refresh).
- Symbols never seen in history (e.g. uncommitted adds) are left without `added`.
- The file is edited textually (one `added:` line appended to each entry block) so
  existing formatting, quoting and ordering are untouched.
- Symbols first seen in the initial import (2026-07-23) get that date; the UI labels
  them "≤07-23 (import)" because their real add date is unknown.

Usage:
  python update_pipeline/scripts/backfill_added.py [--path FlipCharts/watchlist.yaml] [--ref HEAD] [--dry-run]
"""
import argparse
import collections
import datetime
import re
import subprocess
import sys

SYMBOL_RE = re.compile(r"^-\s+symbol:\s*['\"]?([^'\"\s]+)['\"]?\s*$")


def git(*args: str) -> str:
    return subprocess.run(["git", *args], check=True, capture_output=True, text=True).stdout


def first_seen(path: str, ref: str) -> dict:
    """Map SYMBOL -> YYYY-MM-DD of the oldest commit (reachable from ref) containing it."""
    log = git("log", ref, "--reverse", "--format=%H %ct", "--", path).split("\n")
    seen = {}
    for line in filter(None, log):
        sha, ts = line.split()
        day = datetime.datetime.fromtimestamp(int(ts), datetime.timezone.utc).strftime("%Y-%m-%d")
        try:
            text = git("show", f"{sha}:{path}")
        except subprocess.CalledProcessError:
            continue  # file deleted / renamed in this commit
        for l in text.splitlines():
            m = SYMBOL_RE.match(l.strip())
            if m:
                seen.setdefault(m.group(1).upper(), day)
    return seen


def apply(text: str, seen: dict) -> tuple:
    lines = text.split("\n")
    out, stats = [], collections.Counter()
    block = []

    def flush():
        if not block:
            return
        m = SYMBOL_RE.match(block[0].strip())
        sym = m.group(1).upper() if m else None
        has_added = any(re.match(r"^\s+added:", l) for l in block)
        body = list(block)
        trailing = []
        while body and not body[-1].strip():
            trailing.insert(0, body.pop())
        if sym and not has_added:
            if sym in seen:
                body.append(f"  added: '{seen[sym]}'")
                stats[seen[sym]] += 1
            else:
                stats["missing"] += 1
        elif sym:
            stats["already"] += 1
        out.extend(body + trailing)
        block.clear()

    for l in lines:
        if l.startswith("- "):
            flush()
            block.append(l)
        elif block:
            block.append(l)
        else:
            out.append(l)
    flush()
    return "\n".join(out), stats


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--path", default="FlipCharts/watchlist.yaml")
    ap.add_argument("--ref", default="HEAD")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    seen = first_seen(a.path, a.ref)
    with open(a.path) as f:
        text = f.read()
    new, stats = apply(text, seen)
    print("Coverage (added date -> symbols):")
    for k in sorted(stats):
        print(f"  {k}: {stats[k]}")
    if a.dry_run:
        print("[dry run] no changes written")
        return 0
    with open(a.path, "w") as f:
        f.write(new)
    print(f"Wrote {a.path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
