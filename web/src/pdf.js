// Client-side PDF rendering with pdf-lib (mirrors engine/render_slice.py and
// render_range.py). Runs entirely in the browser — the logo bytes never leave
// the machine. Fonts (Archivo, Spectral) are fetched from the site and embedded.

import { describeQuery, titleCase, typeLabel } from "./curate.js";
import { preview } from "./images.js";

const { PDFDocument, rgb } = window.PDFLib;

const MM = 72 / 25.4;            // points per mm
const PAGE_W = 210 * MM;
const PAGE_H = 297 * MM;

function hex(c) {
  const v = c.replace("#", "");
  const n = v.length === 3 ? v.split("").map((x) => x + x).join("") : v;
  return rgb(parseInt(n.slice(0, 2), 16) / 255, parseInt(n.slice(2, 4), 16) / 255,
            parseInt(n.slice(4, 6), 16) / 255);
}
function mix(c, alpha) { // blend toward white (approx opacity on light)
  const k = hex(c);
  return rgb(k.red + (1 - k.red) * (1 - alpha), k.green + (1 - k.green) * (1 - alpha),
            k.blue + (1 - k.blue) * (1 - alpha));
}

let _fontCache = null;
async function loadFonts(pdf) {
  pdf.registerFontkit(window.fontkit);
  if (!_fontCache) {
    const grab = (f) => fetch(`fonts/${f}`).then((r) => r.arrayBuffer());
    _fontCache = {
      archivo: await grab("Archivo-Regular.ttf"),
      archivoSemi: await grab("Archivo-SemiBold.ttf"),
      archivoBold: await grab("Archivo-Bold.ttf"),
      spectral: await grab("Spectral.ttf"),
      spectralBold: await grab("Spectral-Bold.ttf"),
    };
  }
  return {
    display: await pdf.embedFont(_fontCache.archivo),
    displaySemi: await pdf.embedFont(_fontCache.archivoSemi),
    displayBold: await pdf.embedFont(_fontCache.archivoBold),
    serif: await pdf.embedFont(_fontCache.spectral),
    serifBold: await pdf.embedFont(_fontCache.spectralBold),
  };
}

// y is measured from the TOP in mm; convert to pdf-lib's bottom-origin points.
function yTop(mm) { return PAGE_H - mm * MM; }

function drawText(page, x, y, s, font, size, color, { align = "left", tracking = 0 } = {}) {
  let width = font.widthOfTextAtSize(s, size);
  if (tracking) width += tracking * Math.max(s.length - 1, 0);
  let xpt = x * MM;
  if (align === "center") xpt -= width / 2;
  else if (align === "right") xpt -= width;
  page.drawText(s, {
    x: xpt, y: yTop(y), size, font, color,
    ...(tracking ? { characterSpacing: tracking } : {}),
  });
}

function box(page, x, y, w, h, { fill, stroke, line = 0.5 } = {}) {
  page.drawRectangle({
    x: x * MM, y: yTop(y + h), width: w * MM, height: h * MM,
    ...(fill ? { color: fill } : {}),
    ...(stroke ? { borderColor: stroke, borderWidth: line } : {}),
  });
}

function fitImage(img, boxW, boxH, pad) {
  const bw = boxW - 2 * pad, bh = boxH - 2 * pad;
  const s = Math.min(bw / img.width, bh / img.height);
  return { w: img.width * s, h: img.height * s };
}

function truncate(s, font, size, maxMM) {
  const max = maxMM * MM;
  if (font.widthOfTextAtSize(s, size) <= max) return s;
  while (s.length && font.widthOfTextAtSize(s + "…", size) > max) s = s.slice(0, -1);
  return s + "…";
}

// ---- shared: turn entries into embedded images ----------------------------

async function embedPreviews(pdf, src, profile, entries, bgHex) {
  const out = [];
  for (const e of entries) {
    const blob = await src.getBlob(profile, `logos/${e.file}`);
    const pv = await preview(blob, `${profile}/${e.file}`, bgHex);
    const img = await pdf.embedJpg(pv.bytes);
    out.push({ entry: e, img });
  }
  return out;
}

// ---- Slice (client deliverable) -------------------------------------------

export async function renderSlice(src, profile, theme, entries, query) {
  const pdf = await PDFDocument.create();
  const F = await loadFonts(pdf);
  const pal = theme.palette;
  const tiles = await embedPreviews(pdf, src, profile, entries, pal.paper);

  // Cover
  const cover = pdf.addPage([PAGE_W, PAGE_H]);
  cover.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: hex(pal.cover_bg) });
  const mx = 24;
  const kicker = (theme.labels.slice_kicker || "Selected work").toUpperCase();
  drawText(cover, mx, 95, kicker, F.displaySemi, 10, hex(pal.accent), { tracking: 2.2 });
  box(cover, mx, 100, 28, 0.8, { fill: hex(pal.accent) });
  let titleSize = 40;
  while (F.displayBold.widthOfTextAtSize(theme.name, titleSize) > (PAGE_W - 2 * mx * MM) && titleSize > 20) titleSize -= 2;
  drawText(cover, mx, 120, theme.name, F.displayBold, titleSize, hex(pal.cover_fg));
  drawText(cover, mx, 134, titleCase(describeQuery(query.industries, query.types, query.matchAll)),
           F.serif, 15, mix(pal.cover_fg, 0.85));
  const n = entries.length;
  drawText(cover, mx, 297 - 24, `${n} selected mark${n === 1 ? "" : "s"} · curated slice`,
           F.display, 9.5, mix(pal.cover_fg, 0.6));

  // Grid
  const cols = theme.layout.tile_cols;
  const gm = 14, top = 30;
  const gap = theme.layout.density === "comfortable" ? 8 : 5;
  const contentW = 210 - 2 * gm;
  const tileW = (contentW - gap * (cols - 1)) / cols;
  const imgH = tileW * 0.72, capH = 11, tileH = imgH + capH, rowGap = gap + 2;

  let page = pdf.addPage([PAGE_W, PAGE_H]);
  const header = (pg) => {
    drawText(pg, gm, top - 8, theme.name, F.displayBold, 15, hex(pal.ink));
    drawText(pg, 210 - gm, top - 8,
      `${titleCase(describeQuery(query.industries, query.types, query.matchAll))} · ${n} marks`,
      F.display, 9, hex(pal.muted), { align: "right" });
    box(pg, gm, top - 4, contentW, 0.3, { fill: hex(pal.accent_soft) });
  };
  header(page);
  let col = 0, rowY = top;
  for (const { entry, img } of tiles) {
    if (rowY + tileH > 297 - 16) { page = pdf.addPage([PAGE_W, PAGE_H]); header(page); rowY = top; col = 0; }
    const x = gm + col * (tileW + gap);
    box(page, x, rowY, tileW, imgH, { fill: hex(pal.paper), stroke: hex(pal.accent_soft), line: 0.5 });
    const f = fitImage(img, tileW, imgH, tileW * 0.12);
    page.drawImage(img, {
      x: (x + tileW / 2) * MM - (f.w * MM) / 2,
      y: yTop(rowY + imgH / 2) - (f.h * MM) / 2,
      width: f.w * MM, height: f.h * MM,
    });
    drawText(page, x, rowY + imgH + 5, truncate(entry.name, F.displaySemi, 10.5, tileW), F.displaySemi, 10.5, hex(pal.ink));
    drawText(page, x, rowY + imgH + 9.2, typeLabel(entry.types).toUpperCase(), F.display, 7, hex(pal.muted), { tracking: 0.8 });
    if (++col >= cols) { col = 0; rowY += tileH + rowGap; }
  }
  return pdf.save();
}

// ---- Range sheet (breadth) ------------------------------------------------

export async function renderRange(src, profile, theme, entries, query) {
  const pdf = await PDFDocument.create();
  const F = await loadFonts(pdf);
  const pal = theme.palette;
  const tiles = await embedPreviews(pdf, src, profile, entries, pal.paper);

  const cols = Math.max(4, Math.min(theme.layout.tile_cols + 2, 6));
  const gm = 12, gap = 4;
  const contentW = 210 - 2 * gm;
  const tileW = (contentW - gap * (cols - 1)) / cols;
  const imgH = tileW, capH = 8, tileH = imgH + capH;
  const title = theme.labels.range_title || "Full range";
  const n = entries.length;

  let page = pdf.addPage([PAGE_W, PAGE_H]);
  // first header
  drawText(page, gm, 18, theme.name, F.displayBold, 22, hex(pal.ink));
  box(page, gm, 22, 22, 0.8, { fill: hex(pal.accent) });
  drawText(page, gm, 27, `${title} · ${titleCase(describeQuery(query.industries, query.types, query.matchAll))} · ${n} marks`,
           F.display, 9, hex(pal.muted));
  const runHeader = (pg) => {
    drawText(pg, gm, 10, theme.name, F.displayBold, 9, hex(pal.ink));
    drawText(pg, 210 - gm, 10, title.toUpperCase(), F.display, 8, hex(pal.accent), { align: "right", tracking: 1.2 });
  };

  let top = 30, col = 0, rowY = top;
  for (const { entry, img } of tiles) {
    if (rowY + tileH > 297 - 14) { page = pdf.addPage([PAGE_W, PAGE_H]); runHeader(page); top = 18; rowY = top; col = 0; }
    const x = gm + col * (tileW + gap);
    box(page, x, rowY, tileW, imgH, { fill: hex(pal.paper), stroke: hex(pal.accent_soft), line: 0.4 });
    const f = fitImage(img, tileW, imgH, tileW * 0.14);
    page.drawImage(img, {
      x: (x + tileW / 2) * MM - (f.w * MM) / 2,
      y: yTop(rowY + imgH / 2) - (f.h * MM) / 2,
      width: f.w * MM, height: f.h * MM,
    });
    drawText(page, x, rowY + imgH + 3.5, truncate(entry.name, F.displaySemi, 7.5, tileW), F.displaySemi, 7.5, hex(pal.ink));
    drawText(page, x, rowY + imgH + 6.5, typeLabel(entry.types).toUpperCase(), F.display, 5.5, hex(pal.muted), { tracking: 0.5 });
    if (++col >= cols) { col = 0; rowY += tileH + gap + 1; }
  }
  return pdf.save();
}
