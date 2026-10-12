#!/usr/bin/env python3
"""Regenerates about.html's FAQPage JSON-LD from the real <details> FAQ block, so the
two can never drift out of sync again.

Run this after editing any FAQ question or answer in about.html:
    python3 tools/generate-faq-schema.py
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PATH = ROOT / "about.html"


def strip_tags(s):
    return re.sub(r"<[^>]+>", "", s).strip()


def main():
    text = PATH.read_text()
    details = re.findall(r"<details><summary>(.*?)</summary><div>(.*?)</div></details>", text, re.S)
    if not details:
        raise SystemExit("No FAQ <details> entries found - is the markup still shaped the same way?")

    schema = {
        "@context": "https://schema.org/",
        "@type": "FAQPage",
        "mainEntity": [
            {
                "@type": "Question",
                "name": strip_tags(q),
                "acceptedAnswer": {"@type": "Answer", "text": strip_tags(a)},
            }
            for q, a in details
        ],
    }
    new_script = f'<script type="application/ld+json">{json.dumps(schema)}</script>'
    updated = re.sub(
        r'<script type="application/ld\+json">.*?</script>', new_script, text, count=1, flags=re.S
    )
    PATH.write_text(updated)
    print(f"Regenerated FAQPage schema with {len(details)} questions.")


if __name__ == "__main__":
    main()
