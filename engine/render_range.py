"""Range sheet PDF — a dense contact sheet to show breadth (ReportLab).

Many small tiles per page with light captions, paginating as needed. Reuses
the same library, theme and image pipeline as the slice; only the layout is
denser. Same filter options apply, so a range sheet can also be scoped.
"""

from __future__ import annotations

from pathlib import Path

from . import images
from .curate import Query
from .library import Library, LogoEntry
from .render_common import (
    Pen,
    color,
    font_name,
    new_canvas,
    truncate,
    type_label,
)
from .theme import Theme

PAGE_W_MM, PAGE_H_MM = 210.0, 297.0


def render_range(library: Library, theme: Theme, entries: list[LogoEntry],
                 query: Query, out_path: Path, build_dir: Path) -> int:
    """Render the range sheet PDF. Returns the output size in bytes."""
    previews_dir = build_dir / library.profile / "previews"
    tile_bg = theme.palette.get("paper", "#FFFFFF")
    previews = [images.preview_for(e.path, previews_dir, bg_hex=tile_bg) for e in entries]

    pal = theme.palette
    cols = max(4, min(theme.tile_cols + 2, 6))
    mx = 12.0
    gap = 4.0
    content_w = PAGE_W_MM - 2 * mx
    tile_w = (content_w - gap * (cols - 1)) / cols
    img_h = tile_w                      # square frame
    cap_h = 8.0
    tile_h = img_h + cap_h
    head_h = 22.0
    first_top = 30.0
    cont_top = 18.0

    title = theme.labels.get("range_title", "Full range")
    c = new_canvas(out_path)
    pen = Pen(c)
    page_no = [1]

    def running_header():
        pen.text(mx, 10, theme.name, font_name(theme, "display", "bold"), 9, color(pal["ink"]))
        pen.text(PAGE_W_MM - mx, 10, title.upper(), font_name(theme, "body", "normal"), 8,
                 color(pal["accent"]), align="right", tracking=1.2)

    def first_header():
        pen.text(mx, 18, theme.name, font_name(theme, "display", "bold"), 22, color(pal["ink"]))
        pen.rect(mx, 22, 22, 0.8, fill=color(pal["accent"]))
        meta = f"{title} · {query.describe().title()} · {len(entries)} marks"
        pen.text(mx, 27, meta, font_name(theme, "body", "normal"), 9, color(pal["muted"]))

    first_header()
    top = first_top
    col = 0
    row_y = top
    for entry, preview in zip(entries, previews):
        if row_y + tile_h > PAGE_H_MM - 14:
            pen.text(PAGE_W_MM / 2, PAGE_H_MM - 8, f"{page_no[0]}",
                     font_name(theme, "body", "normal"), 8, color(pal["muted"]), align="center")
            c.showPage()
            page_no[0] += 1
            running_header()
            top = cont_top
            row_y = top
            col = 0
        x = mx + col * (tile_w + gap)
        pen.rect(x, row_y, tile_w, img_h, fill=color(pal["paper"]),
                 stroke=color(pal["accent_soft"]), line=0.4,
                 radius=theme.layout.get("tile_radius_mm", 3))
        pen.image_fit(preview, x, row_y, tile_w, img_h, pad=tile_w * 0.14)
        nm_font = font_name(theme, "body", "semibold")
        nm = truncate(c, entry.name, nm_font, 7.5, tile_w)
        pen.text(x, row_y + img_h + 3.5, nm, nm_font, 7.5, color(pal["ink"]))
        pen.text(x, row_y + img_h + 6.5, type_label(entry.types).upper(),
                 font_name(theme, "body", "normal"), 5.5, color(pal["muted"]), tracking=0.5)
        col += 1
        if col >= cols:
            col = 0
            row_y += tile_h + gap + 1.0

    pen.text(PAGE_W_MM / 2, PAGE_H_MM - 8, f"{page_no[0]}",
             font_name(theme, "body", "normal"), 8, color(pal["muted"]), align="center")
    c.showPage()
    c.save()
    return out_path.stat().st_size
