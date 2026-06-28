"""Load and validate a profile's ``theme.json``.

The theme is the profile's *face* — palette, fonts, layout, labels. Nothing
visual is hard-coded in the renderers; every surface reads from here. A
missing key falls back to a sensible default so a partial theme still renders.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

# Keys the renderers rely on, with defaults applied when a theme omits them.
_PALETTE_DEFAULTS = {
    "ink": "#15181E",
    "paper": "#FFFFFF",
    "accent": "#E2683C",
    "accent_soft": "#FBEDE6",
    "muted": "#6B7280",
    "cover_bg": "#15181E",
    "cover_fg": "#FFFFFF",
}

_FONT_DEFAULTS = {
    "display": "Archivo",
    "body": "Archivo",
    "serif": "Spectral",
}

_LAYOUT_DEFAULTS = {
    "cover_style": "dark",       # "dark" | "light"
    "tile_cols": 3,
    "tile_radius_mm": 3,
    "density": "comfortable",    # "comfortable" | "compact"
}

_LABEL_DEFAULTS = {
    "slice_kicker": "Selected work",
    "range_title": "Full range",
}

_VALID_SORT = {"industry", "type"}


class ThemeError(ValueError):
    """Raised when a theme file is missing or malformed."""


@dataclass
class Theme:
    """A validated, fully-populated profile theme."""

    id: str
    name: str
    sort_primary: str
    palette: dict[str, str]
    fonts: dict[str, str]
    layout: dict[str, Any]
    labels: dict[str, str]
    raw: dict[str, Any] = field(default_factory=dict, repr=False)

    @property
    def tile_cols(self) -> int:
        return int(self.layout["tile_cols"])

    @property
    def is_dark_cover(self) -> bool:
        return str(self.layout.get("cover_style", "dark")).lower() == "dark"

    def font_families(self) -> set[str]:
        """Unique font family names referenced by this theme."""
        return {v for v in self.fonts.values() if v}


def _merge(defaults: dict, override: Any) -> dict:
    out = dict(defaults)
    if isinstance(override, dict):
        out.update({k: v for k, v in override.items() if v is not None})
    return out


def load_theme(path: str | Path) -> Theme:
    """Load ``theme.json`` from ``path`` and return a validated :class:`Theme`."""
    p = Path(path)
    if not p.exists():
        raise ThemeError(f"theme file not found: {p}")
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ThemeError(f"theme {p} is not valid JSON: {exc}") from exc
    if not isinstance(data, dict):
        raise ThemeError(f"theme {p} must be a JSON object")

    theme_id = data.get("id") or p.parent.name
    name = data.get("name") or theme_id

    sort_primary = str(data.get("sort_primary", "industry")).lower()
    if sort_primary not in _VALID_SORT:
        raise ThemeError(
            f"theme {p}: sort_primary must be one of {sorted(_VALID_SORT)}, "
            f"got {sort_primary!r}"
        )

    return Theme(
        id=str(theme_id),
        name=str(name),
        sort_primary=sort_primary,
        palette=_merge(_PALETTE_DEFAULTS, data.get("palette")),
        fonts=_merge(_FONT_DEFAULTS, data.get("fonts")),
        layout=_merge(_LAYOUT_DEFAULTS, data.get("layout")),
        labels=_merge(_LABEL_DEFAULTS, data.get("labels")),
        raw=data,
    )
