#!/usr/bin/env python3
"""Rebuilds sitemap.xml from the static pages plus every non-hidden product.

Run this after adding, hiding, or removing a product:
    python3 tools/generate-sitemap.py
"""
import json
from datetime import date, timezone, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = "https://floshops.com"

STATIC_PAGES = [
    ("/", "1.0", "weekly"),
    ("/shop.html", "0.9", "weekly"),
    ("/about.html", "0.5", "monthly"),
    ("/policies.html", "0.3", "yearly"),
    ("/contact.html", "0.3", "yearly"),
    ("/size-guide.html", "0.3", "monthly"),
]

today = date.today().isoformat()


def url(loc, priority, changefreq):
    return (
        "  <url>\n"
        f"    <loc>{SITE}{loc}</loc>\n"
        f"    <lastmod>{today}</lastmod>\n"
        f"    <changefreq>{changefreq}</changefreq>\n"
        f"    <priority>{priority}</priority>\n"
        "  </url>\n"
    )


def main():
    products = json.loads((ROOT / "assets/data/products.json").read_text())["products"]
    entries = [url(loc, pr, cf) for loc, pr, cf in STATIC_PAGES]
    for p in products:
        if p.get("hidden"):
            continue
        entries.append(url(f"/product.html?id={p['id']}", "0.8", "weekly"))

    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "".join(entries)
        + "</urlset>\n"
    )
    (ROOT / "sitemap.xml").write_text(xml)
    print(f"sitemap.xml written with {len(entries)} URLs")


if __name__ == "__main__":
    main()
