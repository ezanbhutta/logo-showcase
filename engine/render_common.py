"""Shared rendering helpers built on ReportLab (pure Python, no system libs).

This replaced the original WeasyPrint renderer so the whole app can be bundled
into a single Windows executable with zero extra installs. The two PDF modes
(``render_slice``, ``render_range``) share font registration, colour parsing,
and image-fitting from here, so they differ only in layout.

ReportLab's canvas origin is bottom-left; the ``Pen`` wrapper lets the
renderers work in familiar top-left millimetre coordinates instead.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from reportlab.lib.colors import Color, HexColor
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas

from .resources import base_dir
from .theme import Theme

REPO_ROOT = base_dir()
FONTS_DIR = REPO_ROOT / "fonts"

MM = 72.0 / 25.4          # points per millimetre
PAGE_W, PAGE_H = A4       # points

# Fallback families if a theme references a font we don't ship.
_FALLBACK = {"normal": "Helvetica", "bold": "Helvetica-Bold", "semibold": "Helvetica-Bold"}


@lru_cache(maxsize=1)
def register_fonts() -> set[str]:
    """Register every TTF in ``fonts/`` with ReportLab. Returns family names.

    Files are grouped by the part before the first ``-`` (``Archivo-Bold`` ->
    family ``Archivo``). Each family is registered with normal/semibold/bold
    faces, falling back to the regular face when a weight file is absent.
    """
    families: dict[str, dict[str, Path]] = {}
    for ttf in sorted(FONTS_DIR.glob("*.ttf")):
        fam, _, variant = ttf.stem.partition("-")
        families.setdefault(fam, {})[(variant or "Regular").lower()] = ttf

    registered: set[str] = set()
    for fam, variants in families.items():
        regular = variants.get("regular") or next(iter(variants.values()))
        bold = variants.get("bold", regular)
        semibold = variants.get("semibold", bold)
        pdfmetrics.registerFont(TTFont(fam, str(regular)))
        pdfmetrics.registerFont(TTFont(f"{fam}-Bold", str(bold)))
        pdfmetrics.registerFont(TTFont(f"{fam}-SemiBold", str(semibold)))
        pdfmetrics.registerFontFamily(fam, normal=fam, bold=f"{fam}-Bold")
        registered.add(fam)
    return registered


def font_name(theme: Theme, role: str, weight: str = "normal") -> str:
    """Resolve a (theme role, weight) to a registered ReportLab font name."""
    families = register_fonts()
    fam = theme.fonts.get(role) or "Archivo"
    if fam not in families:
        return _FALLBACK.get(weight, "Helvetica")
    if weight == "bold":
        return f"{fam}-Bold"
    if weight == "semibold":
        return f"{fam}-SemiBold"
    return fam


def color(hex_str: str, alpha: float = 1.0) -> Color:
    """Parse ``#RRGGBB`` (alpha blended toward white when < 1)."""
    c = HexColor(hex_str)
    if alpha >= 1.0:
        return c
    # Approximate opacity over a light surface by blending toward white.
    return Color(
        c.red + (1 - c.red) * (1 - alpha),
        c.green + (1 - c.green) * (1 - alpha),
        c.blue + (1 - c.blue) * (1 - alpha),
    )


class Pen:
    """Thin wrapper over a ReportLab canvas using top-left mm coordinates."""

    def __init__(self, canvas: Canvas):
        self.c = canvas

    # --- coordinate helpers (input mm from top-left) ---
    def _y(self, y_mm: float) -> float:
        return PAGE_H - y_mm * MM

    def rect(self, x, y, w, h, fill=None, stroke=None, line=0.3, radius=0.0):
        c = self.c
        if fill is not None:
            c.setFillColor(fill)
        if stroke is not None:
            c.setStrokeColor(stroke)
            c.setLineWidth(line)
        x_pt, w_pt, h_pt = x * MM, w * MM, h * MM
        y_pt = self._y(y + h)  # bottom edge
        do_fill = 1 if fill is not None else 0
        do_stroke = 1 if stroke is not None else 0
        if radius > 0:
            c.roundRect(x_pt, y_pt, w_pt, h_pt, radius * MM, stroke=do_stroke, fill=do_fill)
        else:
            c.rect(x_pt, y_pt, w_pt, h_pt, stroke=do_stroke, fill=do_fill)

    def text(self, x, y, s, font, size, fill, align="left", tracking=0.0):
        """Draw a single line. ``y`` is the text baseline from the top.

        ``tracking`` (extra letter spacing, in points) is applied via a text
        object since the canvas has no char-space setter.
        """
        c = self.c
        x_pt, y_pt = x * MM, self._y(y)
        if not tracking:
            c.setFillColor(fill)
            c.setFont(font, size)
            if align == "center":
                c.drawCentredString(x_pt, y_pt, s)
            elif align == "right":
                c.drawRightString(x_pt, y_pt, s)
            else:
                c.drawString(x_pt, y_pt, s)
            return
        w = pdfmetrics.stringWidth(s, font, size) + tracking * max(len(s) - 1, 0)
        if align == "center":
            start = x_pt - w / 2
        elif align == "right":
            start = x_pt - w
        else:
            start = x_pt
        t = c.beginText(start, y_pt)
        t.setFont(font, size)
        t.setFillColor(fill)
        t.setCharSpace(tracking)
        t.textOut(s)
        c.drawText(t)

    def image_fit(self, path, x, y, w, h, pad=0.0):
        """Draw an image contained within the (x,y,w,h) mm box, centred."""
        img = ImageReader(str(path))
        iw, ih = img.getSize()
        bw, bh = (w - 2 * pad), (h - 2 * pad)
        scale = min(bw / iw, bh / ih)
        dw, dh = iw * scale, ih * scale
        cx, cy = x + w / 2, y + h / 2
        x_pt = (cx - dw / 2) * MM
        y_pt = self._y(cy + dh / 2)
        self.c.drawImage(
            img, x_pt, y_pt, dw * MM, dh * MM, mask="auto", preserveAspectRatio=True
        )


def truncate(canvas: Canvas, s: str, font: str, size: float, max_mm: float) -> str:
    """Trim ``s`` with an ellipsis so it fits within ``max_mm`` millimetres."""
    max_pt = max_mm * MM
    if pdfmetrics.stringWidth(s, font, size) <= max_pt:
        return s
    ell = "…"
    while s and pdfmetrics.stringWidth(s + ell, font, size) > max_pt:
        s = s[:-1]
    return s + ell


def type_label(types: list[str]) -> str:
    return ", ".join(t.replace("-", " ").title() for t in types[:2])


def new_canvas(out_path: Path) -> Canvas:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    register_fonts()
    return Canvas(str(out_path), pagesize=A4)
