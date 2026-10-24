"""Package static site assets into browser-upload-sized tarballs.

Run after Build-Release.ps1. Every archive extracts at the server root.
"""

from pathlib import Path
import tarfile


ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / ".deploy" / "wispbyte"
RELEASE = WORK / "release"
PUBLIC = RELEASE / "apps" / "web" / "public"
GROUPS = ("town-images", "town-models", "brand", "audio", "town-scenes", "town-textures")
MAX_UNCOMPRESSED = 18 * 1024 * 1024


def main() -> None:
    files = sorted(
        (path for group in GROUPS for path in (PUBLIC / group).rglob("*") if path.is_file()),
        key=lambda path: path.relative_to(RELEASE).as_posix(),
    )
    batches: list[list[Path]] = []
    batch: list[Path] = []
    size = 0
    for path in files:
        length = path.stat().st_size
        if batch and size + length > MAX_UNCOMPRESSED:
            batches.append(batch)
            batch = []
            size = 0
        batch.append(path)
        size += length
    if batch:
        batches.append(batch)

    for index, paths in enumerate(batches, 1):
        archive = WORK / f"dnd-nerds-assets-{index:02}.tar.gz"
        with tarfile.open(archive, "w:gz", compresslevel=3) as tar:
            for path in paths:
                tar.add(path, arcname="./" + path.relative_to(RELEASE).as_posix(), recursive=False)
        print(f"{archive.name}: {archive.stat().st_size / 1024 / 1024:.1f} MiB, {len(paths)} files")


if __name__ == "__main__":
    main()
