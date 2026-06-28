"""Range sheet PDF — a dense contact sheet to show breadth.

Many small tiles per page with light captions, paginating as needed. Reuses
the same library, theme and image pipeline as the slice; only the layout is
denser. Same filter options apply, so a range sheet can also be scoped.
"""

from __future__ import annotations

from pathlib import Path

from . import images
from .curate import Query
from .library import LogoEntry, Library
from .render_common import (
    esc,
    file_url,
    font_face_css,
    theme_vars,
    type_label,
    write_pdf,
)
from .theme import Theme


def _page_css(profile_name: str, title: str) -> str:
    return f"""
@page {{
  size: A4;
  margin: 14mm 12mm 14mm 12mm;
  @top-left {{
    content: "{profile_name}";
    font-family: var(--font-display);
    font-size: 9pt;
    font-weight: 700;
    color: var(--ink);
  }}
  @top-right {{
    content: "{title}";
    font-family: var(--font-body);
    font-size: 8pt;
    letter-spacing: .14em;
    text-transform: uppercase;
    color: var(--accent);
  }}
  @bottom-center {{
    content: counter(page) " / " counter(pages);
    font-family: var(--font-body);
    font-size: 8pt;
    color: var(--muted);
  }}
}}
"""


def _base_css(cols: int) -> str:
    return f"""
* {{ box-sizing: border-box; }}
html, body {{ margin: 0; padding: 0; }}
body {{ font-family: var(--font-body); color: var(--ink); background: var(--paper); }}

.head h1 {{
  font-family: var(--font-display);
  font-size: 22pt;
  font-weight: 700;
  margin: 0 0 1mm 0;
}}
.head .meta {{ font-size: 9pt; color: var(--muted); margin-bottom: 6mm; letter-spacing: .03em; }}
.head .bar {{ height: 2px; background: var(--accent); width: 22mm; margin-bottom: 6mm; }}

.grid {{
  display: grid;
  grid-template-columns: repeat({cols}, 1fr);
  gap: 4mm;
}}
.tile {{ break-inside: avoid; }}
.tile .frame {{
  border: 1px solid var(--accent_soft);
  border-radius: var(--tile-radius);
  aspect-ratio: 1 / 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4mm;
  overflow: hidden;
}}
.tile .frame img {{ max-width: 100%; max-height: 100%; object-fit: contain; }}
.tile .nm {{
  font-size: 7.5pt;
  font-weight: 600;
  margin-top: 1.5mm;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}}
.tile .ty {{ font-size: 6pt; color: var(--muted); text-transform: uppercase; letter-spacing: .1em; }}
"""


def _tile_html(entry: LogoEntry, preview_path: Path) -> str:
    return f"""
<div class="tile">
  <div class="frame"><img src="{file_url(preview_path)}" alt="{esc(entry.name)}"></div>
  <div class="nm">{esc(entry.name)}</div>
  <div class="ty">{esc(type_label(entry.types))}</div>
</div>
"""


def render_range(
    library: Library,
    theme: Theme,
    entries: list[LogoEntry],
    query: Query,
    out_path: Path,
    build_dir: Path,
) -> int:
    """Render the range sheet PDF. Returns the output size in bytes."""
    previews_dir = build_dir / library.profile / "previews"
    tile_bg = theme.palette.get("paper", "#FFFFFF")

    # Denser grid than the slice: 2 extra columns, clamped to a sane range.
    cols = max(4, min(theme.tile_cols + 2, 6))

    tiles = []
    for e in entries:
        pv = images.preview_for(e.path, previews_dir, bg_hex=tile_bg)
        tiles.append(_tile_html(e, pv))

    title = theme.labels.get("range_title", "Full range")
    scope = query.describe().title()

    html_doc = f"""<!doctype html>
<html><head><meta charset="utf-8"><style>
{font_face_css(theme)}
{theme_vars(theme)}
{_page_css(esc(theme.name), esc(title))}
{_base_css(cols)}
</style></head>
<body>
<section class="head">
  <h1>{esc(theme.name)}</h1>
  <div class="bar"></div>
  <div class="meta">{esc(title)} · {esc(scope)} · {len(entries)} marks</div>
</section>
<div class="grid">
  {''.join(tiles)}
</div>
</body></html>"""

    return write_pdf(html_doc, out_path)
