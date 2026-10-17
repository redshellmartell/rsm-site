"""Writes smaller copies of every image for responsive srcset: photo.webp ->
photo-400.webp and photo-800.webp. Run after adding images: python3 scripts/make-sizes.py
Needs Pillow. build.mjs picks the copies up automatically."""

import re
from pathlib import Path
from PIL import Image

WIDTHS = (400, 800)
root = Path(__file__).resolve().parent.parent / "assets" / "img"

made = 0
for src in sorted(root.rglob("*.webp")):
    if re.search(r"-\d+$", src.stem):
        continue
    with Image.open(src) as im:
        for w in WIDTHS:
            out = src.with_name(f"{src.stem}-{w}.webp")
            if im.width <= w or out.exists():
                continue
            h = round(im.height * w / im.width)
            im.resize((w, h), Image.LANCZOS).save(out, "WEBP", quality=78, method=6)
            made += 1
print(f"Wrote {made} resized images")
