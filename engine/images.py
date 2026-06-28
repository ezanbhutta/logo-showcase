"""Screen-resolution preview generation with a content-addressed cache.

Masters live in ``profiles/<p>/logos/``. Previews are generated to
``build/<p>/previews/`` fit to ``MAX_EDGE`` px on the longest side and kept
under ``TARGET_KB``. A preview is regenerated only when its master's bytes
change (hash in the filename), so repeat runs are fast.

Transparent PNGs are flattened onto the theme's tile background so the logo
reads correctly on paper; that background colour is part of the cache key.
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from PIL import Image

MAX_EDGE = 1200          # px, longest edge of a preview
TARGET_KB = 120          # soft ceiling per preview
_JPEG_MIN_QUALITY = 60


def _hash_file(path: Path) -> str:
    h = hashlib.sha1()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()[:16]


def _hex_to_rgb(value: str) -> tuple[int, int, int]:
    v = value.lstrip("#")
    if len(v) == 3:
        v = "".join(c * 2 for c in v)
    return tuple(int(v[i : i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


def _luma(rgb: tuple[int, int, int]) -> float:
    r, g, b = rgb
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def preview_for(
    master: Path,
    out_dir: Path,
    *,
    bg_hex: str = "#FFFFFF",
    max_edge: int = MAX_EDGE,
    target_kb: int = TARGET_KB,
) -> Path:
    """Return a cached preview for ``master``, generating it if needed.

    The output is a PNG when the source has transparency-on-light (keeps crisp
    edges for line logos) and an optimized JPEG otherwise. The chosen format,
    background and source hash all factor into the cache filename.
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    src_hash = _hash_file(master)
    bg_tag = bg_hex.lstrip("#").lower()
    stem = f"{master.stem}.{src_hash}.{bg_tag}"

    # Cache hit: any existing file with this stem.
    for ext in (".png", ".jpg"):
        cached = out_dir / f"{stem}{ext}"
        if cached.exists():
            return cached

    with Image.open(master) as im:
        im = im.convert("RGBA")
        im.thumbnail((max_edge, max_edge), Image.Resampling.LANCZOS)

        bg_rgb = _hex_to_rgb(bg_hex)
        canvas = Image.new("RGBA", im.size, bg_rgb + (255,))
        canvas.alpha_composite(im)
        flat = canvas.convert("RGB")

        # Light background -> JPEG is smaller and fine; otherwise keep PNG.
        use_jpeg = _luma(bg_rgb) >= 180
        if use_jpeg:
            out = out_dir / f"{stem}.jpg"
            quality = 85
            flat.save(out, "JPEG", quality=quality, optimize=True, progressive=True)
            while out.stat().st_size > target_kb * 1024 and quality > _JPEG_MIN_QUALITY:
                quality -= 8
                flat.save(out, "JPEG", quality=quality, optimize=True, progressive=True)
        else:
            out = out_dir / f"{stem}.png"
            flat.save(out, "PNG", optimize=True)

    return out
