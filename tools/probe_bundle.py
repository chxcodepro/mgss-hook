"""Search the line-wrapped mini-game bundle for keywords with context.

Usage:
  python tools/probe_bundle.py artifacts/source/game.js count k1 k2 ...
  python tools/probe_bundle.py artifacts/source/game.js ctx k1 --window 120 --limit 5
"""

from __future__ import annotations

import argparse
import io
import re
import sys


def load(path: str) -> str:
    return io.open(path, encoding="utf-8", errors="replace").read()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("bundle")
    parser.add_argument("mode", choices=["count", "ctx", "regex", "slice"])
    parser.add_argument("keys", nargs="*")
    parser.add_argument("--window", type=int, default=140)
    parser.add_argument("--limit", type=int, default=8)
    parser.add_argument("--skip", type=int, default=0)
    parser.add_argument("--before", type=int, default=None)
    parser.add_argument("--at", type=int, default=None)
    args = parser.parse_args()

    source = load(args.bundle)
    if args.mode == "slice":
        start = args.at if args.at is not None else 0
        print(source[start : start + args.window].replace("\n", "\\n").replace("\t", " "))
        return 0
    if args.mode == "count":
        for key in args.keys:
            print(f"{key}\t{source.count(key)}")
        return 0

    for key in args.keys:
        pattern = re.compile(key) if args.mode == "regex" else re.compile(re.escape(key))
        hits = 0
        for match in pattern.finditer(source):
            hits += 1
            if hits <= args.skip:
                continue
            if hits > args.skip + args.limit:
                break
            start = max(0, match.start() - (args.window if args.before is None else args.before))
            end = min(len(source), match.end() + args.window)
            snippet = source[start:end].replace("\n", "\\n").replace("\t", " ")
            print(f"--- {key} #{hits} @{match.start()}\n{snippet}\n")
        print(f"[total {key}: {len(pattern.findall(source))}]")
    return 0


if __name__ == "__main__":
    sys.exit(main())
