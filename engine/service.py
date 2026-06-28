"""High-level operations shared by the web app and the CLI.

Everything here reads the library location and output folder from
:mod:`engine.config`, so callers just pass a profile + filters and get a PDF.
This keeps the Flask routes thin and the CLI honest (same code path).
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from . import config, images, vocab
from .build_gallery import build_manifest
from .curate import Query, curate
from .library import Library, LogoEntry, load_library
from .render_range import render_range
from .render_slice import render_slice
from .theme import Theme, load_theme

DEFAULT_COUNT = 12


class ServiceError(Exception):
    """User-facing error (bad profile, no matches, invalid filter, …)."""


@dataclass
class GenerateResult:
    path: Path
    size: int
    count: int
    profile: str
    theme_name: str
    mode: str


def _profile_dir(profile: str) -> Path:
    d = config.library_root() / profile
    if not d.is_dir():
        raise ServiceError(f"Profile '{profile}' was not found in your library folder.")
    return d


def load_profile(profile: str) -> tuple[Library, Theme]:
    d = _profile_dir(profile)
    try:
        library = load_library(d, profile=profile)
        theme = load_theme(d / "theme.json")
    except Exception as exc:  # surface clean message
        raise ServiceError(str(exc)) from exc
    return library, theme


def normalize_query(industries, types, match: str) -> Query:
    try:
        ni = [vocab.normalize_industry(v) for v in industries if v]
        nt = [vocab.normalize_type(v) for v in types if v]
    except vocab.VocabError as exc:
        raise ServiceError(f"Invalid filter: {exc}") from exc
    return Query(industries=ni, types=nt, match_all=(match == "all"))


def _auto_name(profile: str, query: Query, mode: str) -> str:
    bits = [profile, mode]
    if query.industries:
        bits.append("-".join(query.industries))
    if query.types:
        bits.append("-".join(query.types))
    return "-".join(bits) + ".pdf"


def select_entries(library: Library, query: Query, mode: str, count: int,
                   files: list[str] | None) -> list[LogoEntry]:
    if files:
        by_file = {e.file: e for e in library.entries}
        missing = [f for f in files if f not in by_file]
        if missing:
            raise ServiceError("Not in this profile: " + ", ".join(missing))
        chosen = [by_file[f] for f in files]
        chosen.sort(key=lambda e: (e.tier, -(e.year or -1)))
        if mode == "slice" and len(chosen) > count:
            chosen = chosen[:count]
        return chosen
    if mode == "slice":
        return curate(library, query, count=count)
    return curate(library, query, count=None)


def generate(profile: str, *, industries=None, types=None, match: str = "any",
             mode: str = "slice", count: int = DEFAULT_COUNT,
             files: list[str] | None = None, out_path: Path | None = None) -> GenerateResult:
    """Filter → curate → render. Returns where the PDF landed."""
    library, theme = load_profile(profile)
    query = normalize_query(industries or [], types or [], match)
    entries = select_entries(library, query, mode, count, files)
    if not entries:
        raise ServiceError(
            f"No logos in '{profile}' match [{query.describe()}]. Nothing was created."
        )

    if out_path is None:
        out_path = config.output_dir() / _auto_name(profile, query, mode)
    out_path = Path(out_path)

    render = render_slice if mode == "slice" else render_range
    size = render(library, theme, entries, query, out_path, config.build_dir())
    return GenerateResult(out_path, size, len(entries), profile, theme.name, mode)


def gallery_manifest(profile: str) -> dict:
    """Manifest for the live gallery, previews referenced by logo filename."""
    library, theme = load_profile(profile)
    manifest = build_manifest(library, theme, config.build_dir())
    # Web serves previews by logo filename via the /preview route, so replace
    # the on-disk preview filename with the original logo file as the key.
    for item, entry in zip(manifest["items"], _ordered_active(library, manifest)):
        item["preview"] = entry  # entry is the logo file string
    return manifest


def _ordered_active(library: Library, manifest: dict) -> list[str]:
    # manifest items are already keyed by 'file'; just echo them back in order.
    return [it["file"] for it in manifest["items"]]


def preview_file(profile: str, logo_file: str) -> Path:
    """Return a cached screen-res preview path for one logo (for web serving)."""
    library, theme = load_profile(profile)
    entry = next((e for e in library.entries if e.file == logo_file), None)
    if entry is None:
        raise ServiceError(f"'{logo_file}' is not in profile '{profile}'.")
    previews_dir = config.build_dir() / profile / "previews"
    return images.preview_for(entry.path, previews_dir,
                              bg_hex=theme.palette.get("paper", "#FFFFFF"))
