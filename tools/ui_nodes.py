"""List the labelled nodes of a uiautomator dump with tap-able centres.

Usage: python tools/ui_nodes.py artifacts/ad-ui.xml [--clickable-only]
"""

from __future__ import annotations

import argparse
import re
import sys
import xml.etree.ElementTree as ET

BOUNDS = re.compile(r"\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("dump")
    parser.add_argument("--clickable-only", action="store_true")
    args = parser.parse_args()

    root = ET.parse(args.dump).getroot()
    for node in root.iter("node"):
        text = (node.get("text") or "").strip()
        desc = (node.get("content-desc") or "").strip()
        if not text and not desc:
            continue
        if args.clickable_only and node.get("clickable") != "true":
            continue
        match = BOUNDS.match(node.get("bounds") or "")
        if not match:
            continue
        left, top, right, bottom = (int(value) for value in match.groups())
        print(f"{(left + right) // 2:5d},{(top + bottom) // 2:5d}  "
              f"{'C' if node.get('clickable') == 'true' else ' '}  "
              f"[{left},{top}][{right},{bottom}]  {text or desc}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
