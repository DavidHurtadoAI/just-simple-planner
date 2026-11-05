"""Build or verify the deterministic tutorial download using only the Python standard library."""
from pathlib import Path
import io
import sys
import zipfile

root = Path(__file__).resolve().parents[1]
source = root / "examples" / "tutorial"
destination = root / "docs" / "downloads" / "planner-tutorial.zip"
buffer = io.BytesIO()
with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for file in sorted(source.rglob("*")):
        if not file.is_file():
            continue
        relative = file.relative_to(source)
        if file.suffix not in {".md", ".base"} or any(part.startswith(".") for part in relative.parts):
            raise ValueError(f"Unexpected starter-pack file: {relative}")
        info = zipfile.ZipInfo(relative.as_posix(), date_time=(2026, 11, 5, 0, 0, 0))
        info.create_system = 3
        info.external_attr = 0o100644 << 16
        info.compress_type = zipfile.ZIP_DEFLATED
        # Keep the download identical on LF and CRLF Git checkouts.
        archive.writestr(info, file.read_text(encoding="utf-8").encode("utf-8"), compresslevel=9)

payload = buffer.getvalue()
if "--check" in sys.argv:
    if not destination.exists() or destination.read_bytes() != payload:
        raise SystemExit("Tutorial ZIP is missing or differs from examples/tutorial. Run this script without --check.")
else:
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(payload)
with zipfile.ZipFile(io.BytesIO(payload)) as archive:
    if archive.testzip() is not None:
        raise SystemExit("Invalid ZIP checksum")
    print(f"Tutorial ZIP OK: {len(archive.namelist())} files, {len(payload):,} bytes; matches examples/tutorial.")
