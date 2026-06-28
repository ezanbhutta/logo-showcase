"""Matched slice PDF — the default, client-facing output (ReportLab).

A short profile-themed cover followed by a grid of N tiles, each a real
screen-optimized preview plus ``name · Type``. Everything visual comes from the
theme; the grid paginates automatically when N exceeds one page.
"""

from __future__ import annotations

from pathlib import Path

from . import images
from .curate import Query
from .library import Library, LogoEntry
from .render_common import (
    PAGE_H,
    PAGE_W,
    Pen,
    color,
    font_name,
    new_canvas,
    truncate,
    type_label,
)
from .theme import Theme

MM = 25.4  # page math below is in mm; A4 = 210 x 297
PAGE_W_MM, PAGE_H_MM = 210.0, 297.0


def _draw_cover(pen: Pen, theme: Theme, query: Query, n: int) -> None:
    pal = theme.palette
    pen.rect(0, 0, PAGE_W_MM, PAGE_H_MM, fill=color(pal["cover_bg"]))

    mx = 24.0
    fg = color(pal["cover_fg"])
    accent = color(pal["accent"])

    # Kicker (tracked uppercase) near upper third.
    kicker = theme.labels.get("slice_kicker", "Selected work").upper()
    pen.text(mx, 95, kicker, font_name(theme, "body", "semibold"), 10, accent, tracking=2.2)
    # Accent rule.
    pen.rect(mx, 100, 28, 0.8, fill=accent)
    # Title (display, large). Shrink if very long.
    title = theme.name
    size = 40
    while pen.c.stringWidth(title, font_name(theme, "display", "bold"), size) > (PAGE_W_MM - 2 * mx) * (72 / 25.4) and size > 20:
        size -= 2
    pen.text(mx, 120, title, font_name(theme, "display", "bold"), size, fg)
    # Subtitle (serif), the query in title case.
    pen.text(mx, 134, query.describe().title(), font_name(theme, "serif", "normal"), 15,
             color(pal["cover_fg"], alpha=0.82))

    # Footer meta.
    meta = f"{n} selected mark{'s' if n != 1 else ''} · curated slice"
    pen.text(mx, PAGE_H_MM - 24, meta, font_name(theme, "body", "normal"), 9.5,
             color(pal["cover_fg"], alpha=0.6))


def _draw_grid_pages(pen: Pen, theme: Theme, entries: list[LogoEntry],
                     previews: list[Path], query: Query) -> None:
    pal = theme.palette
    cols = theme.tile_cols
    mx = 14.0
    top = 30.0
    gap = 8.0 if theme.layout.get("density") == "comfortable" else 5.0

    content_w = PAGE_W_MM - 2 * mx
    tile_w = (content_w - gap * (cols - 1)) / cols
    img_h = tile_w * 0.72            # 4:3-ish image frame
    cap_h = 11.0
    tile_h = img_h + cap_h
    row_gap = gap + 2.0

    def header():
        pen.text(mx, top - 8, theme.name, font_name(theme, "display", "bold"), 15,
                 color(pal["ink"]))
        cap = f"{query.describe().title()} · {len(entries)} marks"
        pen.text(PAGE_W_MM - mx, top - 8, cap, font_name(theme, "body", "normal"), 9,
                 color(pal["muted"]), align="right")
        pen.rect(mx, top - 4, content_w, 0.3, fill=color(pal["accent_soft"]))

    header()
    x_i = y = 0
    row_y = top
    col = 0
    for entry, preview in zip(entries, previews):
        if row_y + tile_h > PAGE_H_MM - 16:
            pen.c.showPage()
            header()
            row_y = top
            col = 0
        x = mx + col * (tile_w + gap)
        # Frame + image.
        pen.rect(x, row_y, tile_w, img_h, fill=color(pal["paper"]),
                 stroke=color(pal["accent_soft"]), line=0.5,
                 radius=theme.layout.get("tile_radius_mm", 3))
        pen.image_fit(preview, x, row_y, tile_w, img_h, pad=tile_w * 0.12)
        # Caption.
        nm_font = font_name(theme, "display", "semibold")
        nm = truncate(pen.c, entry.name, nm_font, 10.5, tile_w)
        pen.text(x, row_y + img_h + 5, nm, nm_font, 10.5, color(pal["ink"]))
        pen.text(x, row_y + img_h + 9.2, type_label(entry.types).upper(),
                 font_name(theme, "body", "normal"), 7, color(pal["muted"]), tracking=0.8)
        col += 1
        if col >= cols:
            col = 0
            row_y += tile_h + row_gap


def render_slice(library: Library, theme: Theme, entries: list[LogoEntry],
                 query: Query, out_path: Path, build_dir: Path) -> int:
    """Render the matched slice PDF. Returns the output size in bytes."""
    previews_dir = build_dir / library.profile / "previews"
    tile_bg = theme.palette.get("paper", "#FFFFFF")
    previews = [images.preview_for(e.path, previews_dir, bg_hex=tile_bg) for e in entries]

    c = new_canvas(out_path)
    pen = Pen(c)
    _draw_cover(pen, theme, query, len(entries))
    c.showPage()
    _draw_grid_pages(pen, theme, entries, previews, query)
    c.showPage()
    c.save()
    return out_path.stat().st_size
