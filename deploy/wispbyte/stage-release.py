"""Split verified Wispbyte archives into small browser-uploadable parts."""

import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / ".deploy" / "wispbyte"
ALL_NAMES = ("core", "art", "media", "vtt-app", "vtt-deps")
NAMES = tuple(sys.argv[1:]) or ALL_NAMES
if len(set(NAMES)) != len(NAMES) or any(name not in ALL_NAMES for name in NAMES):
    raise SystemExit(f"Choose unique archive names from: {', '.join(ALL_NAMES)}")
PART_SIZE = 8 * 1024 * 1024
archives = []

for name in NAMES:
    archive = ROOT / f"dnd-nerds-{name}.tar.gz"
    digest = hashlib.sha256()
    parts = []
    with archive.open("rb") as source:
        index = 1
        while chunk := source.read(PART_SIZE):
            digest.update(chunk)
            part_name = f"dnd-release-{name}.part{index:02d}"
            (ROOT / part_name).write_bytes(chunk)
            parts.append(part_name)
            index += 1
    archives.append({"name": archive.name, "sha256": digest.hexdigest(), "parts": parts})

(ROOT / "dnd-release-manifest.json").write_text(
    json.dumps({"version": 1, "archives": archives}, indent=2) + "\n",
    encoding="utf-8",
)
print(f"Prepared {sum(len(item['parts']) for item in archives)} release parts")
