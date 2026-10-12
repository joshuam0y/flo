#!/usr/bin/env python3
"""Checks every local href/src in the HTML pages and every product photo actually exists.
Exits non-zero (failing CI) if anything's missing.

Run it yourself any time with:
    python3 tools/check-links.py
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main():
    missing = []
    for f in ROOT.glob("*.html"):
        text = f.read_text()
        for m in re.finditer(r'(?:href|src)="([^"]+)"', text):
            link = m.group(1)
            if link.startswith(("http://", "https://", "mailto:", "tel:", "#", "javascript:")):
                continue
            path = link.split("?")[0].split("#")[0]
            if path and not (ROOT / path).exists():
                missing.append((f.name, link))

    products = json.loads((ROOT / "assets/data/products.json").read_text())["products"]
    for p in products:
        for c in p.get("colors", []):
            for photo in c.get("photos", []):
                if not (ROOT / photo).exists():
                    missing.append((p["id"], photo))

    if missing:
        print(f"Found {len(missing)} broken local reference(s):")
        for source, link in missing:
            print(f"  {source} -> {link}")
        sys.exit(1)

    print("No broken local links, images, or product photos.")


if __name__ == "__main__":
    main()
