"""Static live gallery — Phase 3, internal only.

Generates ``manifest.json`` plus a static HTML/CSS/vanilla-JS site that reads
it. The team browses, filters by industry/type, searches by name, multi-selects
marks, and exports a list of file names. That list feeds back into the engine
(``--files``) to produce a client-facing slice PDF.

No backend, no off-platform link in any delivery — the PDF stays the only
client-facing channel.
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

from . import images
from .library import Library, load_library
from .theme import Theme, load_theme

REPO_ROOT = Path(__file__).resolve().parent.parent


def build_manifest(library: Library, theme: Theme, build_dir: Path) -> dict:
    """Generate previews and assemble the manifest dict for a profile."""
    gallery_dir = build_dir / library.profile / "gallery"
    previews_out = gallery_dir / "previews"
    tile_bg = theme.palette.get("paper", "#FFFFFF")

    items = []
    industries: set[str] = set()
    types: set[str] = set()
    for e in library.active_entries():
        pv = images.preview_for(e.path, previews_out, bg_hex=tile_bg)
        items.append(
            {
                "file": e.file,
                "name": e.name,
                "industries": e.industries,
                "types": e.types,
                "tier": e.tier,
                "year": e.year,
                "preview": f"previews/{pv.name}",
            }
        )
        industries.update(e.industries)
        types.update(e.types)

    items.sort(key=lambda it: (it["tier"], -(it["year"] or 0), it["name"].lower()))

    return {
        "profile": library.profile,
        "name": theme.name,
        "sort_primary": theme.sort_primary,
        "palette": theme.palette,
        "industries": sorted(industries),
        "types": sorted(types),
        "count": len(items),
        "items": items,
    }


def build_gallery(profile: str, profiles_root: Path, build_dir: Path) -> Path:
    """Build the full static gallery for ``profile``. Returns the output dir."""
    profile_dir = profiles_root / profile
    library = load_library(profile_dir, profile=profile)
    theme = load_theme(profile_dir / "theme.json")

    gallery_dir = build_dir / profile / "gallery"
    gallery_dir.mkdir(parents=True, exist_ok=True)

    manifest = build_manifest(library, theme, build_dir)
    (gallery_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2), encoding="utf-8"
    )

    # Copy the static shell (index.html, app.js, style.css) next to manifest.
    shell = Path(__file__).resolve().parent / "gallery_assets"
    for asset in ("index.html", "app.js", "style.css"):
        shutil.copyfile(shell / asset, gallery_dir / asset)

    return gallery_dir


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(
        prog="python -m engine.build_gallery",
        description="Build the static live gallery for a profile.",
    )
    ap.add_argument("--profile", required=True, help="Profile to build the gallery for.")
    ap.add_argument(
        "--profiles-root", default=str(REPO_ROOT / "profiles"),
        help="Root folder holding per-profile libraries.",
    )
    ap.add_argument(
        "--build", default=str(REPO_ROOT / "build"),
        help="Build output root (gitignored).",
    )
    args = ap.parse_args(argv)

    try:
        out = build_gallery(args.profile, Path(args.profiles_root), Path(args.build))
    except Exception as exc:  # noqa: BLE001 — surface a clean message to the CLI
        print(f"error: {exc}", file=sys.stderr)
        return 1

    print(f"Gallery built: {out}")
    print(f"Open: {(out / 'index.html').resolve().as_uri()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
