#!/usr/bin/env python3
"""One-time migration: rewrite watchlist tags onto Tag Taxonomy v2.

- Dry-run by default: prints a per-file summary of changes.
- --apply writes files (after copying each to a timestamped snapshot dir).
- Theses, statuses, symbols, dates are never touched. Tags only.
- Idempotent: running twice yields the second run a no-op.
"""
import argparse
import os
import shutil
import sys
from collections import Counter
from datetime import datetime

import yaml

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WATCHLISTS = [
    os.path.join(REPO, "FlipCharts", "watchlist.yaml"),
    os.path.join(REPO, "grep_alpha", "watchlists", "IDB_top_50.yaml"),
    os.path.join(REPO, "grep_alpha", "watchlists", "IBD_weekly.yaml"),
]
TAXONOMY = os.path.join(REPO, "available-tags.md")

# legacy / stray tag -> canonical v2 tag
ALIAS = {
    # coarse legacy snake_case vocab
    "software_internet": None,  # split: handled by secondary rules below
    "diversified_etfs": "ETF",
    "infrastructure_industrials": "Manufacturing",
    "aerospace_space": None,     # split: Aero or Space per name
    "healthcare_biotech": "Healthcare",
    "consumer_retail": "E-commerce",
    "energy_utilities": "Energy",
    "financials": "Financial_Services",
    "semiconductors": None,      # split: Semi-IDM / Semi-Fabless / Memory
    # v1-era stray spellings
    "Financial": "Financial_Services",
    "Banking": "Financial_Services",
    "Brokerage": "Financial_Services",
    "Investment_Services": "Financial_Services",
    "Insurance": "Financial_Services",
    "Payments": "Fintech",
    "Mobile_Banking": "Fintech",
    "Cloud_Computing": "Cloud",
    "cloud": "Cloud",
    "Data_Centers": "Hardware",
    "Data_Storage": "Memory",
    "Storage": "Memory",
    "Healthcare": "Healthcare",
    "Health": "Healthcare",
    "Medical": "Healthcare",
    "Mental_Health": "Healthcare",
    "Hospitals": "Healthcare",
    "Computers": "Hardware",
    "Computer_Hardware": "Hardware",
    "Server": "Hardware",
    "Servers": "Hardware",
    "Equipment": "Hardware",
    "Electronics": "Hardware",
    "Electrical_Equipment": "Hardware",
    "Semiconductor_Equipment": "Hardware",
    "Industrial": "Manufacturing",
    "Industrials": "Manufacturing",
    "Industri": "Manufacturing",
    "Cybersecurity": "Cybersecurity",
    "Security": "Cybersecurity",
    "E-commerce": "E-commerce",
    "E_commerce": "E-commerce",
    "Retail": "E-commerce",
    "Online_Retail": "E-commerce",
    "Transportation": "Transportation",
    "Transport": "Transportation",
    "Logistics": "Transportation",
    "Rail": "Transportation",
    "Shipping": "Transportation",
    "Travel": "Transportation",
    "Airline": "Aero",
    "Airlines": "Aero",
    "Defense": "Defense",
    "Military": "Defense",
    "defense_tech": "Defense",
    "Aerospace": "Aero",
    "Aero": "Aero",
    "Media": "Entertainment",
    "Streaming": "Entertainment",
    "Gaming": "Entertainment",
    "Social_Media": "Entertainment",
    "Telecom": "Utilities",
    "Telecommunications": "Utilities",
    "Oil": "Energy",
    "Oil_Gas": "Energy",
    "Oil_Gas_Services": "Energy",
    "Gas": "Energy",
    "Utilities": "Energy",
    "Clean_Energy": "Power",
    "Renewables": "Power",
    "Solar": "Power",
    "Fuel_Cells": "Power",
    "Nuclear": "Power",
    "Restaurants": "Hospitality",
    "Hotel": "Hospitality",
    "Hotels": "Hospitality",
    "Resorts": "Hospitality",
    "Marketing_Technology": "Software",
    "Enterprise_Software": "Software",
    "DevOps": "Software",
    "Observability": "Software",
    "Mobile_Gaming": "Entertainment",
    "transportation_logistics": "Transportation",
    "Data_Analytics": "Software",
    "Components": "Hardware",
    "Consumer_Electronics": "Hardware",
    "Electronics_Manufacturing": "Hardware",
    "Graphics_Processing": "Semi-Fabless",
    "Auto": "Transportation",
    "Automotive": "Transportation",
    "Commodities": "Metals",
    "Materials": "Metals",
    "Advertising": "Entertainment",
    "Communications": "Network",
    "Data_Warehousing": "Cloud",
    "Refining": "Energy",
    "Consumer_Staples": None,
    "Cruise_Line": "Hospitality",
    "Enterprise_Technology": "Software",
    "EV": "Transportation",
    "Restaurant": "Hospitality",
    "Robotics": "Hardware",
    "Small_Cap": None,
    "Biotechnology": "Bio",
    "Oncology": "Bio",
    "Insurance_Broker": "Financial_Services",
    "Fintech": "Fintech",
    "Financial_Services": "Financial_Services",
    "Manufacturing": "Manufacturing",
    "Technology": None,          # too vague: drop
    "Tech": None,
    "tech": None,
    "Equity": None,
    "Blue_Chip": "Blue_Chip",
    "Broad_Market": "Broad_Market",
    "Leveraged_ETF": "Leveraged_ETF",
    "Defensive": None,
    "High_Growth": None,
    "Volatile": None,
    "Earnings_Risk": None,
    "Unknown_Industry": "Unknown_Sector",
    "Distorted_Volume": None,
    "Private_Prisons": "Defense",
    "Government_Services": "Defense",
    "Penny_Stock": None,
    "Micro_Cap": None,
    "China": None,
    "Gold": "Metals",
    "Mining": "Metals",
    "Homebuilding": "Manufacturing",
    "Construction": "Manufacturing",
    "Real_Estate": "Financial_Services",
    "Apparel": None,
    "Luxury_Goods": None,
    "Graphic_Processing": None,
}

# secondary split rules for ambiguous legacy tags: ticker-level keyword inspection
SPLITTERS = {
    "aerospace_space": lambda item: "Space" if any(
        k in (item.get("thesis") or "").lower() + item.get("symbol", "").lower()
        for k in ("rocket", "satellite", "launch", "space", "orbital", "rklb", "asts")
    ) else "Aero",
    "semiconductors": lambda item: "Memory" if any(
        k in (item.get("thesis") or "").lower() + item.get("symbol", "").lower()
        for k in ("memory", "dram", "nand", "storage", "wdc", "stx", "mu", "wmem")
    ) else "Semi-IDM",
    "software_internet": lambda item: "Network" if any(
        k in (item.get("thesis") or "").lower() + item.get("symbol", "").lower()
        for k in ("network", "telecom", "fiber", "comm")
    ) else "Cloud" if any(
        k in (item.get("thesis") or "").lower()
        for k in ("cloud", "saas", "platform")
    ) else "Software",
}


def load_taxonony_tags():
    tags = set()
    for line in open(TAXONOMY):
        line = line.strip()
        if line and not line.startswith("#") and " - " in line:
            tags.add(line.split(" - ")[0].strip())
    return tags


def map_tag(tag, item):
    tag = tag.strip()
    if not tag:
        return []
    if tag in ALIAS:
        target = ALIAS[tag]
        if target is not None:
            return [target]
        if tag in SPLITTERS:
            return [SPLITTERS[tag](item)]
        return []  # dropped (None without splitter)
    return [tag]  # already canonical


def migrate_file(path, apply):
    data = yaml.safe_load(open(path))
    items = data if isinstance(data, list) else data.get("tickers", [])
    changes = Counter()
    residuals = Counter()
    touched = 0
    for item in items:
        raw = item.get("tags") or []
        if isinstance(raw, str):
            raw = [t.strip() for t in raw.split(",") if t.strip()]
        new_tags = []
        for t in raw:
            for mapped in map_tag(t, item):
                if mapped not in new_tags:
                    new_tags.append(mapped)
        # canonical spellcheck + dedupe; drop empty
        new_tags = [t for t in new_tags if t]
        for t in new_tags:
            changes[t] += 1
        if new_tags != raw:
            touched += 1
        item["tags"] = ", ".join(new_tags)
    # residual check
    canonical = load_taxonony_tags()
    for t, c in changes.items():
        if t not in canonical:
            residuals[t] = c

    print(f"\n=== {os.path.relpath(path, REPO)} ===")
    print(f"tickers: {len(items)} | changed: {touched}")
    print(f"resulting tag distribution (top 40):")
    for t, c in changes.most_common(40):
        flag = "" if t in canonical else "  <-- RESIDUAL (not in taxonomy)"
        print(f"  {t}: {c}{flag}")
    if residuals:
        print(f"RESIDUAL DISTINCT: {len(residuals)}")

    if apply:
        stamp = datetime.now().strftime("%Y-%m-%d_%H%M%S")
        snap_dir = os.path.join(os.path.dirname(path), ".tagv2_backup")
        os.makedirs(snap_dir, exist_ok=True)
        shutil.copy2(path, os.path.join(snap_dir, os.path.basename(path) + "." + stamp))
        yaml.safe_dump(data, open(path, "w"), sort_keys=False, default_flow_style=False, allow_unicode=True)
        print(f"APPLIED (backup in {snap_dir})")
    return touched


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="write changes (default: dry-run)")
    args = ap.parse_args()
    total = 0
    for wl in WATCHLISTS:
        total += migrate_file(wl, apply=args.apply)
    mode = "APPLIED" if args.apply else "DRY-RUN (no files written)"
    print(f"\nTotal tickers touched: {total} — {mode}")
    if not args.apply:
        print("Review the summary above, then re-run with --apply to write.")


if __name__ == "__main__":
    main()
