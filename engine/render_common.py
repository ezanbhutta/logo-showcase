"""Shared rendering helpers for the PDF modes.

Holds the bits both ``render_slice`` and ``render_range`` need: HTML escaping,
font ``@font-face`` embedding from ``fonts/``, theme→CSS-variable mapping, and
the WeasyPrint call. Keeping these here means the two renderers differ only in
layout, never in how the theme is wired up.
"""

from __future__ import annotations

import html
from pathlib import Path

from weasyprint import HTML

from .theme import Theme

REPO_ROOT = Path(__file__).resolve().parent.parent
FONTS_DIR = REPO_ROOT / "fonts"

# Map a font family name to candidate files in fonts/. We embed whatever is
# present; a family with no file simply falls back to the generic stack below.
_GENERIC = {
    "Archivo": "sans-serif",
    "Spectral": "serif",
}

_WEIGHT_HINTS = {
    "regular": 400,
    "medium": 500,
    "semibold": 600,
    "bold": 700,
    "black": 900,
    "light": 300,
}


def esc(text: str) -> str:
    return html.escape(str(text), quote=True)


def file_url(path: Path) -> str:
    return path.resolve().as_uri()


def _weight_for(filename: str) -> str:
    """CSS font-weight value for a font file.

    A weight word in the name maps to that weight. No hint -> a full
    ``100 900`` range, which lets a single variable font (e.g. Archivo) answer
    both regular and bold requests instead of being synthetic-bolded.
    """
    low = filename.lower()
    for hint, weight in _WEIGHT_HINTS.items():
        if hint in low:
            return str(weight)
    return "100 900"


def font_face_css(theme: Theme) -> str:
    """Build @font-face rules for every theme font that has files in fonts/.

    Looks for ``fonts/<Family>*.ttf|otf|woff2``. If none exist for a family the
    renderer relies on the generic fallback, so the system still produces a PDF
    without bundled fonts (just not the bespoke face).
    """
    rules: list[str] = []
    for family in sorted(theme.font_families()):
        matches = sorted(
            p
            for ext in ("ttf", "otf", "woff2", "woff")
            for p in FONTS_DIR.glob(f"{family}*.{ext}")
        )
        for fp in matches:
            weight = _weight_for(fp.name)
            style = "italic" if "italic" in fp.name.lower() else "normal"
            rules.append(
                "@font-face{{font-family:'{fam}';font-style:{style};"
                "font-weight:{w};src:url('{url}');}}".format(
                    fam=family, style=style, w=weight, url=file_url(fp)
                )
            )
    return "\n".join(rules)


def font_stack(theme: Theme, role: str) -> str:
    """CSS font-family value for a theme role (display/body/serif)."""
    fam = theme.fonts.get(role, "")
    generic = _GENERIC.get(fam, "sans-serif" if role != "serif" else "serif")
    return f"'{fam}', {generic}" if fam else generic


def theme_vars(theme: Theme) -> str:
    """Theme palette + fonts as CSS custom properties."""
    p = theme.palette
    lines = [f"--{k}:{v};" for k, v in p.items()]
    lines.append(f"--font-display:{font_stack(theme, 'display')};")
    lines.append(f"--font-body:{font_stack(theme, 'body')};")
    lines.append(f"--font-serif:{font_stack(theme, 'serif')};")
    lines.append(f"--tile-radius:{theme.layout.get('tile_radius_mm', 3)}mm;")
    return ":root{" + "".join(lines) + "}"


def write_pdf(html_str: str, out_path: Path) -> int:
    """Render ``html_str`` to ``out_path`` and return the file size in bytes."""
    out_path.parent.mkdir(parents=True, exist_ok=True)
    HTML(string=html_str, base_url=str(REPO_ROOT)).write_pdf(str(out_path))
    return out_path.stat().st_size


def type_label(types: list[str]) -> str:
    """Human label for a tile, e.g. ['abstract'] -> 'Abstract'."""
    return ", ".join(t.replace("-", " ").title() for t in types[:2])
