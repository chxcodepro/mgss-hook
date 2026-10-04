"""Extract one script from a plaintext Android WXA package."""
from __future__ import annotations

import argparse
import struct
from pathlib import Path


def extract(package: Path, name: str) -> bytes:
    raw = package.read_bytes()
    if len(raw) < 18 or raw[0] != 0xBE or raw[13] != 0xED:
        raise ValueError("Unsupported WXA package")
    count = struct.unpack_from(">I", raw, 14)[0]
    offset = 18
    wanted = "/" + name.lstrip("/")
    for _ in range(count):
        length = struct.unpack_from(">I", raw, offset)[0]
        offset += 4
        entry = raw[offset : offset + length].decode("utf-8")
        offset += length
        start, size = struct.unpack_from(">II", raw, offset)
        offset += 8
        if entry == wanted:
            if start < 18 or start + size > len(raw):
                raise ValueError("Invalid WXA entry")
            return raw[start : start + size]
    raise ValueError(f"Entry missing: {wanted}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("package", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--entry", default="/js/game.js")
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(extract(args.package, args.entry))
    print(args.output)
