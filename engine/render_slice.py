"""Matched slice PDF — the default, client-facing output.

A short profile-themed cover followed by a grid of N tiles, each tile a real
screen-optimized preview plus ``name · Type``. Caps at the requested count and
targets well under 2 MB. Everything visual comes from the theme.
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

PAGE_CSS = """
@page {
  size: A4;
  margin: 16mm 14mm 16mm 14mm;
  @bottom-center {
    content: "" counter(page) " / " counter(pages);
    font-family: var(--font-body);
    font-size: 8pt;
    color: var(--muted);
  }
}
@page :first { margin: 0; }
"""


def _base_css(theme: Theme, cols: int) -> str:
    gap = "8mm" if theme.layout.get("density") == "comfortable" else "5mm"
    return f"""
* {{ box-sizing: border-box; }}
html, body {{ margin: 0; padding: 0; }}
body {{
  font-family: var(--font-body);
  color: var(--ink);
  background: var(--paper);
  -weasy-hyphens: none;
}}

/* ---- Cover ---- */
.cover {{
  height: 297mm;
  padding: 32mm 24mm;
  background: var(--cover_bg);
  color: var(--cover_fg);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}}
.cover .kicker {{
  font-family: var(--font-body);
  text-transform: uppercase;
  letter-spacing: .28em;
  font-size: 10pt;
  font-weight: 600;
  color: var(--accent);
}}
.cover h1 {{
  font-family: var(--font-display);
  font-size: 40pt;
  line-height: 1.04;
  margin: 6mm 0 0 0;
  font-weight: 700;
}}
.cover .sub {{
  font-family: var(--font-serif);
  font-size: 14pt;
  margin-top: 5mm;
  color: var(--cover_fg);
  opacity: .82;
}}
.cover .meta {{
  font-size: 9.5pt;
  letter-spacing: .04em;
  color: var(--cover_fg);
  opacity: .65;
}}
.cover .rule {{ height: 2px; width: 28mm; background: var(--accent); margin: 8mm 0; }}

/* ---- Grid ---- */
.sheet-head {{
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  border-bottom: 1px solid var(--accent_soft);
  padding-bottom: 4mm;
  margin-bottom: 7mm;
}}
.sheet-head .t {{ font-family: var(--font-display); font-size: 15pt; font-weight: 700; }}
.sheet-head .c {{ font-size: 9pt; color: var(--muted); letter-spacing: .04em; }}

.grid {{
  display: grid;
  grid-template-columns: repeat({cols}, 1fr);
  gap: {gap};
}}
.tile {{ break-inside: avoid; }}
.tile .frame {{
  border: 1px solid var(--accent_soft);
  border-radius: var(--tile-radius);
  background: var(--paper);
  aspect-ratio: 4 / 3;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 7mm;
  overflow: hidden;
}}
.tile .frame img {{ max-width: 100%; max-height: 100%; object-fit: contain; }}
.tile .cap {{ margin-top: 3mm; }}
.tile .cap .nm {{ font-family: var(--font-display); font-size: 10.5pt; font-weight: 600; }}
.tile .cap .ty {{
  font-size: 8pt;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: .12em;
  margin-top: 1mm;
}}
"""


def _cover_html(theme: Theme, query: Query, n: int) -> str:
    kicker = esc(theme.labels.get("slice_kicker", "Selected work"))
    sub = esc(query.describe().title())
    return f"""
<section class="cover">
  <div>
    <div class="kicker">{kicker}</div>
    <div class="rule"></div>
    <h1>{esc(theme.name)}</h1>
    <div class="sub">{sub}</div>
  </div>
  <div class="meta">{n} selected mark{'s' if n != 1 else ''} · curated slice</div>
</section>
"""


def _tile_html(entry: LogoEntry, preview_path: Path) -> str:
    return f"""
<div class="tile">
  <div class="frame"><img src="{file_url(preview_path)}" alt="{esc(entry.name)}"></div>
  <div class="cap">
    <div class="nm">{esc(entry.name)}</div>
    <div class="ty">{esc(type_label(entry.types))}</div>
  </div>
</div>
"""


def render_slice(
    library: Library,
    theme: Theme,
    entries: list[LogoEntry],
    query: Query,
    out_path: Path,
    build_dir: Path,
) -> int:
    """Render the matched slice PDF. Returns the output size in bytes."""
    previews_dir = build_dir / library.profile / "previews"
    tile_bg = theme.palette.get("paper", "#FFFFFF")

    tiles = []
    for e in entries:
        pv = images.preview_for(e.path, previews_dir, bg_hex=tile_bg)
        tiles.append(_tile_html(e, pv))

    cols = theme.tile_cols
    head_title = esc(theme.name)
    head_caption = esc(query.describe().title())

    html_doc = f"""<!doctype html>
<html><head><meta charset="utf-8"><style>
{font_face_css(theme)}
{theme_vars(theme)}
{PAGE_CSS}
{_base_css(theme, cols)}
</style></head>
<body>
{_cover_html(theme, query, len(entries))}
<section class="grid-page">
  <div class="sheet-head">
    <div class="t">{head_title}</div>
    <div class="c">{head_caption} · {len(entries)} marks</div>
  </div>
  <div class="grid">
    {''.join(tiles)}
  </div>
</section>
</body></html>"""

    return write_pdf(html_doc, out_path)
