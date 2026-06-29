// Client-side, agency-grade PDF rendering with pdf-lib. Runs entirely in the
// browser — logo bytes never leave the machine. Each studio profile gets a
// distinct cover treatment, personalised cover ("Prepared for …"), running
// footers and a closing page, so the deliverable feels designed, not generated.

import { describeQuery, titleCase, typeLabel } from "./curate.js";
import { preview, previewPNG } from "./images.js";

const { PDFDocument, rgb } = window.PDFLib;

const MM = 72 / 25.4;
const PAGE_W = 210 * MM;
const PAGE_H = 297 * MM;

// ---- font registry ---------------------------------------------------------

const FONT_FILES = {
  Archivo:      { regular: "Archivo-Regular.ttf", semibold: "Archivo-SemiBold.ttf", bold: "Archivo-Bold.ttf" },
  Spectral:     { regular: "Spectral.ttf",        semibold: "Spectral-Bold.ttf",    bold: "Spectral-Bold.ttf" },
  SpaceGrotesk: { regular: "SpaceGrotesk-Regular.ttf", semibold: "SpaceGrotesk-SemiBold.ttf", bold: "SpaceGrotesk-Bold.ttf" },
  Sora:         { regular: "Sora-Regular.ttf",    semibold: "Sora-SemiBold.ttf",    bold: "Sora-Bold.ttf" },
  Syne:         { regular: "Syne-Regular.ttf",    semibold: "Syne-SemiBold.ttf",    bold: "Syne-Bold.ttf" },
  DMSans:       { regular: "DMSans-Regular.ttf",  semibold: "DMSans-SemiBold.ttf",  bold: "DMSans-Bold.ttf" },
  Fraunces:     { regular: "Fraunces-Regular.ttf", semibold: "Fraunces-SemiBold.ttf", bold: "Fraunces-Bold.ttf" },
  Cormorant:    { regular: "Cormorant-Regular.ttf", semibold: "Cormorant-SemiBold.ttf", bold: "Cormorant-Bold.ttf" },
  Inter:        { regular: "Inter-Regular.ttf",   semibold: "Inter-SemiBold.ttf",   bold: "Inter-Bold.ttf" },
  JetBrainsMono:{ regular: "JetBrainsMono-Regular.ttf", semibold: "JetBrainsMono-Medium.ttf", bold: "JetBrainsMono-Medium.ttf" },
};
// High-contrast / refined serifs get a touch more weight at display size.
const SERIF_DISPLAY = new Set(["Fraunces", "Cormorant", "Spectral"]);
const _buf = new Map();
async function buf(file) {
  if (!_buf.has(file)) _buf.set(file, await fetch(`fonts/${file}`).then((r) => r.arrayBuffer()));
  return _buf.get(file);
}
async function makeFonts(pdf, theme) {
  pdf.registerFontkit(window.fontkit);
  // Always embed JetBrains Mono — used for indices, page numbers and micro-labels
  // across every studio (the typographic "system" layer).
  const fams = [...new Set([theme.fonts.display, theme.fonts.body, theme.fonts.serif, "JetBrainsMono"])];
  const emb = {};
  // Embed every needed family/weight in parallel, subsetted so only the glyphs
  // actually used ship in the PDF — far smaller files, much faster downloads.
  await Promise.all(fams.map(async (fam) => {
    const f = FONT_FILES[fam] || FONT_FILES.Archivo;
    const [rb, sb, bb] = await Promise.all([buf(f.regular), buf(f.semibold || f.regular), buf(f.bold || f.regular)]);
    const [regular, semibold, bold] = await Promise.all([
      pdf.embedFont(rb, { subset: true }),
      pdf.embedFont(sb, { subset: true }),
      pdf.embedFont(bb, { subset: true }),
    ]);
    emb[fam] = { regular, semibold, bold };
  }));
  return (role, weight = "regular") => {
    const fam = role === "mono" ? "JetBrainsMono" : (theme.fonts[role] || "Archivo");
    return (emb[fam] || emb[theme.fonts.body])[weight];
  };
}

// ---- colour + geometry helpers --------------------------------------------

function hex(c) {
  const v = c.replace("#", "");
  const n = v.length === 3 ? v.split("").map((x) => x + x).join("") : v;
  return rgb(parseInt(n.slice(0, 2), 16) / 255, parseInt(n.slice(2, 4), 16) / 255, parseInt(n.slice(4, 6), 16) / 255);
}
function mix(c, alpha) {
  const k = hex(c);
  return rgb(k.red + (1 - k.red) * (1 - alpha), k.green + (1 - k.green) * (1 - alpha), k.blue + (1 - k.blue) * (1 - alpha));
}
function isLight(c) {
  const k = hex(c);
  return 0.2126 * k.red + 0.7152 * k.green + 0.0722 * k.blue > 0.62;
}
const yT = (mm) => PAGE_H - mm * MM;

function text(page, x, y, s, font, size, color, { align = "left", tracking = 0 } = {}) {
  let w = font.widthOfTextAtSize(s, size);
  if (tracking) w += tracking * Math.max(s.length - 1, 0);
  let xpt = x * MM;
  if (align === "center") xpt -= w / 2;
  else if (align === "right") xpt -= w;
  page.drawText(s, { x: xpt, y: yT(y), size, font, color, ...(tracking ? { characterSpacing: tracking } : {}) });
}
function rect(page, x, y, w, h, { fill, stroke, line = 0.5 } = {}) {
  page.drawRectangle({ x: x * MM, y: yT(y + h), width: w * MM, height: h * MM,
    ...(fill ? { color: fill } : {}), ...(stroke ? { borderColor: stroke, borderWidth: line } : {}) });
}
function hline(page, x1, x2, y, color, w = 0.4) {
  page.drawLine({ start: { x: x1 * MM, y: yT(y) }, end: { x: x2 * MM, y: yT(y) }, thickness: w, color });
}
function vline(page, x, y1, y2, color, w = 0.4) {
  page.drawLine({ start: { x: x * MM, y: yT(y1) }, end: { x: x * MM, y: yT(y2) }, thickness: w, color });
}
function fit(img, bw, bh, pad) {
  const s = Math.min((bw - 2 * pad) / img.width, (bh - 2 * pad) / img.height);
  return { w: img.width * s, h: img.height * s };
}
function clip(s, font, size, maxMM) {
  const max = maxMM * MM;
  if (font.widthOfTextAtSize(s, size) <= max) return s;
  while (s.length && font.widthOfTextAtSize(s + "…", size) > max) s = s.slice(0, -1);
  return s + "…";
}
function fitTitle(s, font, startSize, maxMM, minSize = 22) {
  let size = startSize;
  while (size > minSize && font.widthOfTextAtSize(s, size) > maxMM * MM) size -= 1;
  return size;
}

// ---- typographic system ----------------------------------------------------
// God-tier decks live and die on micro-typography: airy tracked small-caps for
// labels, tight tracking on big display, a mono "system" face for numerals.
const caps = (s) => String(s ?? "").toUpperCase();
// Optical tracking for big display type — tighter as it grows (in points).
const displayTrack = (size) => -(size * 0.018);
// A tracked small-caps micro label in the mono system face.
function microLabel(page, x, y, s, F, size, color, { align = "left", track = size * 0.22 } = {}) {
  text(page, x, y, caps(s), F("mono", "regular"), size, color, { align, tracking: track });
}
// A two-up mono page folio: "03 / 12".
function folio(page, x, y, no, total, F, color, align = "right") {
  text(page, x, y, `${String(no).padStart(2, "0")} / ${String(total).padStart(2, "0")}`,
    F("mono", "regular"), 7.5, color, { align, tracking: 0.6 });
}

async function embedPreviews(pdf, src, profile, entries, bgHex) {
  // Fetch + downscale + JPEG-encode every logo in parallel (the slow part),
  // then embed sequentially. Previews are cached, so repeat exports are instant.
  const prepared = await Promise.all(entries.map(async (e) => {
    const blob = await src.getBlob(profile, `logos/${e.file}`);
    const pv = await preview(blob, `${profile}/${e.file}`, bgHex);
    return { entry: e, bytes: pv.bytes };
  }));
  const out = [];
  for (const p of prepared) out.push({ entry: p.entry, img: await pdf.embedJpg(p.bytes) });
  return out;
}

// ---- studio brandmark ------------------------------------------------------
// Optional per-studio logo, dropped at  web/brand/<id>.(svg|png|jpg).  Rasterised
// with transparency so it sits cleanly on the (often dark/coloured) cover.
const _markCache = new Map();
// Studios whose ORIGINAL logo file is vendored at web/brand/<id>.(svg|png|jpg).
// Add an id here only once its real, unaltered file is dropped in — the cover
// then renders it verbatim. No tracing / recreation.
const BRANDED = new Set([]);
async function loadBrandmark(pdf, theme) {
  const id = theme.id;
  if (!id || !BRANDED.has(id)) return null;
  for (const ext of ["svg", "png", "jpg"]) {
    try {
      const res = await fetch(`brand/${id}.${ext}`);
      if (!res.ok) continue;
      const ck = `${id}.${ext}`;
      let pv = _markCache.get(ck);
      if (!pv) { pv = await previewPNG(await res.blob(), `brand/${ck}`, 700); _markCache.set(ck, pv); }
      return await pdf.embedPng(pv.bytes);
    } catch { /* try next extension */ }
  }
  return null;
}
function drawMark(page, mark, xMM, topMM, heightMM, align = "left") {
  const wMM = (mark.width / mark.height) * heightMM;
  const x = align === "center" ? xMM - wMM / 2 : align === "right" ? xMM - wMM : xMM;
  page.drawImage(mark, { x: x * MM, y: yT(topMM + heightMM), width: wMM * MM, height: heightMM * MM });
  return wMM;
}

// ---- covers (one per studio style) ----------------------------------------

function drawCover(page, theme, F, ctx) {
  const pal = theme.palette;
  const style = theme.layout.cover_style || "editorial";
  const bg = hex(pal.cover_bg), fg = hex(pal.cover_fg), accent = hex(pal.accent);
  rect(page, 0, 0, 210, 297, { fill: bg });
  // Studio logo: centered at top for symmetric styles, else tucked top-right
  // (cover titles are left-aligned, so this never collides).
  if (ctx.mark) {
    if (style === "serif") drawMark(page, ctx.mark, 105, 32, 17, "center");
    else drawMark(page, ctx.mark, 210 - 22, 22, 16, "right");
  }
  const fgMuted = isLight(pal.cover_bg) ? mix(pal.cover_fg, 0.55) : mix(pal.cover_fg, 0.6);

  const kicker = theme.labels.slice_kicker || "Selected work";
  const title = theme.name;
  const sub = ctx.subtitle;
  const subFont = F("serif", "regular");          // elegant serif strap-line

  const drawClientBlock = (x, y, align = "left") => {
    if (ctx.clientName) {
      microLabel(page, x, y, "Prepared for", F, 7, accent, { align, track: 1.8 });
      text(page, x, y + 6.5, ctx.clientName, F("serif", "semibold"), 14, fg, { align });
    }
    if (ctx.dateStr) microLabel(page, x, y + (ctx.clientName ? 13 : 0), ctx.dateStr, F, 7.5, fgMuted, { align, track: 1.2 });
  };
  const dispTitle = (x, y, max, start, min, align = "left") => {
    const size = fitTitle(title, F("display", "bold"), start, max, min);
    text(page, x, y, title, F("display", "bold"), size, fg, { align, tracking: displayTrack(size) });
    return size;
  };

  if (style === "bold") {
    const mx = 22;
    microLabel(page, mx, 64, kicker, F, 9, accent, { track: 3 });
    dispTitle(mx, 130, 210 - 2 * mx, 84, 40);
    rect(page, mx, 138, 32, 1.4, { fill: accent });
    text(page, mx, 151, sub, subFont, 16, mix(pal.cover_fg, 0.9), { tracking: 0.2 });
    drawClientBlock(mx, 232);
    microLabel(page, 210 - mx, 273, `${ctx.n} marks`, F, 8, fgMuted, { align: "right", track: 1.6 });

  } else if (style === "serif") {
    // centered, double hairline frame, high-contrast serif — couture
    rect(page, 16, 16, 178, 265, { stroke: mix(pal.cover_fg, 0.30), line: 0.6 });
    rect(page, 19.5, 19.5, 171, 258, { stroke: mix(pal.cover_fg, 0.14), line: 0.4 });
    microLabel(page, 105, 58, kicker, F, 8.5, accent, { align: "center", track: 3.6 });
    const size = fitTitle(title, F("display", "semibold"), 66, 154, 30);
    text(page, 105, 142, title, F("display", "semibold"), size, fg, { align: "center", tracking: displayTrack(size) });
    hline(page, 88, 122, 151, accent, 0.8);
    text(page, 105, 167, sub, subFont, 15, mix(pal.cover_fg, 0.85), { align: "center", tracking: 0.3 });
    drawClientBlock(105, 230, "center");
    microLabel(page, 105, 262, `${ctx.n} marks`, F, 7.5, mix(pal.cover_fg, 0.55), { align: "center", track: 2 });

  } else if (style === "minimal") {
    const mx = 22;
    microLabel(page, mx, 40, kicker, F, 8, accent, { track: 2.8 });
    dispTitle(mx, 72, 210 - 2 * mx, 48, 26);
    text(page, mx, 86, sub, subFont, 13, mix(pal.cover_fg, 0.6), { tracking: 0.2 });
    hline(page, mx, 210 - mx, 250, mix(pal.cover_fg, 0.22), 0.5);
    drawClientBlock(mx, 262);
    microLabel(page, 210 - mx, 268, `${ctx.n} marks`, F, 8, mix(pal.cover_fg, 0.55), { align: "right", track: 1.6 });

  } else if (style === "gridlines") {
    const grid = mix(pal.cover_fg, isLight(pal.cover_bg) ? 0.12 : 0.1);
    for (let gx = 22; gx <= 188; gx += logoStep(166, 6)) vline(page, gx, 22, 275, grid, 0.3);
    for (let gy = 40; gy <= 275; gy += 26) hline(page, 22, 188, gy, grid, 0.3);
    const mx = 22;
    microLabel(page, mx, 34, kicker, F, 8.5, accent, { track: 2.6 });
    dispTitle(mx, 120, 210 - 2 * mx, 64, 34);
    rect(page, mx, 127, 28, 1.4, { fill: accent });
    text(page, mx, 139, sub, subFont, 13, mix(pal.cover_fg, 0.85), { tracking: 0.2 });
    drawClientBlock(mx, 238);
    microLabel(page, 188, 269, `${ctx.n} marks`, F, 8, mix(pal.cover_fg, 0.6), { align: "right", track: 1.6 });

  } else {
    // editorial (default) — asymmetric magazine layout
    const mx = 24;
    microLabel(page, mx, 84, kicker, F, 9, accent, { track: 2.8 });
    rect(page, mx, 90, 32, 1, { fill: accent });
    dispTitle(mx, 120, 210 - 2 * mx, 56, 30);
    text(page, mx, 135, sub, subFont, 15, mix(pal.cover_fg, 0.85), { tracking: 0.2 });
    drawClientBlock(mx, 236);
    microLabel(page, 210 - mx, 273, `${ctx.n} selected · curated slice`, F, 8, fgMuted, { align: "right", track: 1.4 });
  }
}

function logoStep(span, cols) { return span / cols; }

// ---- running footer (content pages) ---------------------------------------

function footer(page, theme, pageNo, total) {
  const pal = theme.palette, F = page._F;
  hline(page, 14, 196, 285, hex(pal.accent_soft), 0.5);
  text(page, 14, 290, theme.name, F("body", "semibold"), 8, hex(pal.muted));
  microLabel(page, 105, 290, theme.labels.slice_kicker || "", F, 6.5, mix(pal.muted, 0.9), { align: "center", track: 1.6 });
  folio(page, 196, 290, pageNo, total, F, hex(pal.muted));
}

// ---- closing page ----------------------------------------------------------

function drawClosing(page, theme, F, ctx) {
  const pal = theme.palette;
  rect(page, 0, 0, 210, 297, { fill: hex(pal.cover_bg) });
  const fg = hex(pal.cover_fg), accent = hex(pal.accent);
  microLabel(page, 105, 120, "Let’s make yours", F, 9, accent, { align: "center", track: 3 });
  const size = fitTitle(theme.name, F("display", "bold"), 42, 170, 24);
  text(page, 105, 150, theme.name, F("display", "bold"), size, fg, { align: "center", tracking: displayTrack(size) });
  hline(page, 92, 118, 159, accent, 0.8);
  if (ctx.clientName) text(page, 105, 180, `Prepared for ${ctx.clientName}`, F("serif", "regular"), 14, mix(pal.cover_fg, 0.85), { align: "center", tracking: 0.2 });
  if (ctx.dateStr) microLabel(page, 105, 191, ctx.dateStr, F, 8, mix(pal.cover_fg, 0.6), { align: "center", track: 1.4 });
}

// ---- slice -----------------------------------------------------------------

function drawGrid(pdf, theme, F, tiles, subtitle, ctx) {
  const pal = theme.palette;
  // Always 2 columns × 3 rows — six big tiles per page filling the sheet within
  // a clean print margin. Logos sit large inside each frame.
  const cols = 2, rowsPerPage = 3, perPage = 6;
  const gm = 13, top = 26, bottom = 13;                       // page margins / bleed
  const gapX = theme.layout.density === "comfortable" ? 11 : 8;
  const gapY = theme.layout.density === "comfortable" ? 9 : 6;
  const capH = 13;                                            // caption band under each frame
  const contentW = 210 - 2 * gm;
  const tileW = (contentW - gapX * (cols - 1)) / cols;
  const usableH = 297 - top - bottom;
  const tileH = (usableH - gapY * (rowsPerPage - 1)) / rowsPerPage;
  const imgH = tileH - capH;                                  // frame fills the rest of the row
  const pad = tileW * 0.07;                                   // tight padding → big marks
  const nameFont = theme.fonts.display === "Fraunces" ? F("body", "semibold") : F("display", "semibold");
  const headerFont = theme.fonts.display === "Fraunces" ? F("body", "bold") : F("display", "bold");
  const header = (pg) => {
    text(pg, gm, top - 11, theme.name, headerFont, 13, hex(pal.ink), { tracking: displayTrack(13) });
    microLabel(pg, 210 - gm, top - 11, `${subtitle} · ${ctx.n} marks`, F, 7.5, hex(pal.muted), { align: "right", track: 1.2 });
    hline(pg, gm, 210 - gm, top - 6, hex(pal.accent), 0.8);
  };
  const pages = [];
  let page = null;
  tiles.forEach(({ entry, img }, i) => {
    const slot = i % perPage;
    if (slot === 0) { page = pdf.addPage([PAGE_W, PAGE_H]); page._F = F; pages.push(page); header(page); }
    const r = Math.floor(slot / cols), c = slot % cols;
    const x = gm + c * (tileW + gapX);
    const y = top + r * (tileH + gapY);
    rect(page, x, y, tileW, imgH, { fill: hex(pal.paper), stroke: hex(pal.accent_soft), line: 0.6 });
    const f = fit(img, tileW, imgH, pad);
    page.drawImage(img, { x: (x + tileW / 2) * MM - (f.w * MM) / 2, y: yT(y + imgH / 2) - (f.h * MM) / 2, width: f.w * MM, height: f.h * MM });
    text(page, x, y + imgH + 7, String(i + 1).padStart(2, "0"), F("mono", "regular"), 7.5, hex(pal.accent), { tracking: 0.3 });
    text(page, x + 9.5, y + imgH + 7, clip(entry.name, nameFont, 12, tileW - 9.5), nameFont, 12, hex(pal.ink));
    if (entry.types && entry.types.length)
      microLabel(page, x + 9.5, y + imgH + 11.4, typeLabel(entry.types), F, 6.6, hex(pal.muted), { track: 1 });
  });
  return pages;
}

function drawLookbook(pdf, theme, F, tiles, subtitle, ctx) {
  const pal = theme.palette;
  const mx = 20, top = 28, bottom = 18, perPage = 2, slotGap = 12;
  const usable = 297 - top - bottom;
  const slotH = (usable - slotGap * (perPage - 1)) / perPage;
  const frameW = 210 - 2 * mx, frameH = slotH - 20;
  const nameFont = theme.fonts.display === "Fraunces" ? F("body", "semibold") : F("display", "semibold");
  const headerFont = theme.fonts.display === "Fraunces" ? F("body", "bold") : F("display", "bold");
  const header = (pg) => {
    text(pg, mx, 16, theme.name, headerFont, 12, hex(pal.ink), { tracking: displayTrack(12) });
    microLabel(pg, 210 - mx, 16, `${subtitle} · ${ctx.n} marks`, F, 7.5, hex(pal.muted), { align: "right", track: 1.2 });
    hline(pg, mx, 210 - mx, 19, hex(pal.accent_soft), 0.4);
  };
  const pages = []; let page = null, slot = 0, idx = 0;
  for (const { entry, img } of tiles) {
    if (slot === 0) { page = pdf.addPage([PAGE_W, PAGE_H]); page._F = F; pages.push(page); header(page); }
    const sy = top + slot * (slotH + slotGap);
    rect(page, mx, sy, frameW, frameH, { fill: hex(pal.paper), stroke: hex(pal.accent_soft), line: 0.6 });
    const f = fit(img, frameW, frameH, 18);
    page.drawImage(img, { x: (mx + frameW / 2) * MM - (f.w * MM) / 2, y: yT(sy + frameH / 2) - (f.h * MM) / 2, width: f.w * MM, height: f.h * MM });
    const cy = sy + frameH + 9;
    text(page, mx, cy, String(++idx).padStart(2, "0"), F("mono", "regular"), 8, hex(pal.accent), { tracking: 0.3 });
    text(page, mx + 10, cy, clip(entry.name, nameFont, 17, frameW - 55), nameFont, 17, hex(pal.ink), { tracking: displayTrack(17) });
    microLabel(page, 210 - mx, cy, typeLabel(entry.types), F, 7.5, hex(pal.muted), { align: "right", track: 1.4 });
    if (indLabel(entry)) text(page, mx + 10, cy + 5.8, indLabel(entry), F("serif", "regular"), 9, mix(pal.muted, 0.85), { tracking: 0.2 });
    slot = (slot + 1) % perPage;
  }
  return pages;
}

// ---- per-studio layout structures -----------------------------------------
// Each studio gets a distinctly different page architecture, on top of its own
// palette / type / cover. Every structure stays big and fits the page.

function nameFonts(theme, F) {
  return {
    name: theme.fonts.display === "Fraunces" ? F("serif", "semibold") : F("display", "semibold"),
    head: theme.fonts.display === "Fraunces" ? F("body", "bold") : F("display", "bold"),
  };
}
function runHead(page, theme, F, subtitle, n, size = 13) {
  const pal = theme.palette, { head } = nameFonts(theme, F);
  text(page, 18, 18, theme.name, head, size, hex(pal.ink), { tracking: displayTrack(size) });
  microLabel(page, 192, 18, `${subtitle} · ${n} marks`, F, 7.5, hex(pal.muted), { align: "right", track: 1.2 });
  hline(page, 18, 192, 23, hex(pal.accent), 0.8);
}
const indLabel = (e) => (e.industries || []).slice(0, 3).map((i) => i.replace(/-/g, " ")).join("  ·  ");

// HERO — one giant mark per page, gallery style.
function drawHero(pdf, theme, F, tiles, subtitle, ctx) {
  const pal = theme.palette, { name } = nameFonts(theme, F), pages = [];
  tiles.forEach(({ entry, img }, i) => {
    const page = pdf.addPage([PAGE_W, PAGE_H]); page._F = F; pages.push(page);
    const gm = 20;
    text(page, gm, 26, String(i + 1).padStart(2, "0"), F("mono", "regular"), 11, hex(pal.accent), { tracking: 0.5 });
    microLabel(page, 210 - gm, 26, subtitle, F, 8, hex(pal.muted), { align: "right", track: 2 });
    hline(page, gm, 210 - gm, 31, hex(pal.accent_soft), 0.6);
    const fy = 44, fh = 176, fw = 210 - 2 * gm;
    rect(page, gm, fy, fw, fh, { fill: hex(pal.paper), stroke: hex(pal.accent_soft), line: 0.8 });
    const f = fit(img, fw, fh, 26);
    page.drawImage(img, { x: 105 * MM - (f.w * MM) / 2, y: yT(fy + fh / 2) - (f.h * MM) / 2, width: f.w * MM, height: f.h * MM });
    rect(page, gm, fy + fh + 13, 26, 1.2, { fill: hex(pal.accent) });
    const size = fitTitle(entry.name, name, 36, 210 - 2 * gm, 18);
    text(page, gm, fy + fh + 26, entry.name, name, size, hex(pal.ink), { tracking: displayTrack(size) });
    const meta = [typeLabel(entry.types), indLabel(entry)].filter(Boolean).join("    —    ");
    if (meta) microLabel(page, gm, fy + fh + 34, meta, F, 8.5, hex(pal.muted), { track: 1.2 });
  });
  return pages;
}

// EDITORIAL — one big mark + two supporting marks per page (magazine spread).
function drawEditorial(pdf, theme, F, tiles, subtitle, ctx) {
  const pal = theme.palette, { name } = nameFonts(theme, F);
  const gm = 18, fullW = 210 - 2 * gm, top = 30, bigH = 120, smallTop = 180, smallH = 86, gap = 10, halfW = (fullW - gap) / 2;
  const tile = (pg, x, y, w, h, entry, img, big) => {
    rect(pg, x, y, w, h, { fill: hex(pal.paper), stroke: hex(pal.accent_soft), line: 0.6 });
    const f = fit(img, w, h, big ? 24 : 14);
    pg.drawImage(img, { x: (x + w / 2) * MM - (f.w * MM) / 2, y: yT(y + h / 2) - (f.h * MM) / 2, width: f.w * MM, height: f.h * MM });
    const ny = y + h + (big ? 9 : 6.5);
    const ns = big ? 17 : 11;
    text(pg, x, ny, clip(entry.name, name, ns, w), name, ns, hex(pal.ink), { tracking: displayTrack(ns) });
    if (entry.types && entry.types.length)
      microLabel(pg, x, ny + (big ? 5.8 : 4.2), typeLabel(entry.types), F, big ? 7.4 : 6.4, hex(pal.muted), { track: big ? 1.4 : 1 });
  };
  const pages = [];
  for (let i = 0; i < tiles.length; i += 3) {
    const page = pdf.addPage([PAGE_W, PAGE_H]); page._F = F; pages.push(page);
    runHead(page, theme, F, subtitle, ctx.n);
    const g = tiles.slice(i, i + 3);
    tile(page, gm, top, fullW, bigH, g[0].entry, g[0].img, true);
    if (g[1]) tile(page, gm, smallTop, halfW, smallH, g[1].entry, g[1].img, false);
    if (g[2]) tile(page, gm + halfW + gap, smallTop, halfW, smallH, g[2].entry, g[2].img, false);
  }
  return pages;
}

// CONTACT — dense numbered index sheet (4 columns).
function drawContact(pdf, theme, F, tiles, subtitle, ctx) {
  const pal = theme.palette, { name } = nameFonts(theme, F);
  const cols = 4, gm = 14, gap = 6, top = 30, contentW = 210 - 2 * gm;
  const tileW = (contentW - gap * (cols - 1)) / cols, imgH = tileW, capH = 10, tileH = imgH + capH, rowGap = 8;
  const rowsPerPage = Math.max(1, Math.floor((283 - top) / (tileH + rowGap))), perPage = cols * rowsPerPage;
  const pages = []; let page = null;
  tiles.forEach(({ entry, img }, i) => {
    const slot = i % perPage;
    if (slot === 0) { page = pdf.addPage([PAGE_W, PAGE_H]); page._F = F; pages.push(page); runHead(page, theme, F, subtitle, ctx.n, 12); }
    const r = Math.floor(slot / cols), c = slot % cols;
    const x = gm + c * (tileW + gap), y = top + r * (tileH + rowGap);
    rect(page, x, y, tileW, imgH, { fill: hex(pal.paper), stroke: hex(pal.accent_soft), line: 0.4 });
    const f = fit(img, tileW, imgH, tileW * 0.12);
    page.drawImage(img, { x: (x + tileW / 2) * MM - (f.w * MM) / 2, y: yT(y + imgH / 2) - (f.h * MM) / 2, width: f.w * MM, height: f.h * MM });
    text(page, x, y + imgH + 4.4, String(i + 1).padStart(2, "0"), F("mono", "regular"), 6, hex(pal.accent), { tracking: 0.2 });
    text(page, x + 8, y + imgH + 4.4, clip(entry.name, name, 6.8, tileW - 8), name, 6.8, hex(pal.ink));
    if (entry.types && entry.types.length)
      microLabel(page, x, y + imgH + 7.7, typeLabel(entry.types), F, 4.8, hex(pal.muted), { track: 0.5 });
  });
  return pages;
}

// SPLIT — full-width rows: mark on the left, big meta on the right.
function drawSplit(pdf, theme, F, tiles, subtitle, ctx) {
  const pal = theme.palette, { name } = nameFonts(theme, F);
  const gm = 18, perPage = 4, top = 32, rowH = 54, rowGap = 8, markW = 62;
  const pages = []; let page = null;
  tiles.forEach(({ entry, img }, i) => {
    const slot = i % perPage;
    if (slot === 0) { page = pdf.addPage([PAGE_W, PAGE_H]); page._F = F; pages.push(page); runHead(page, theme, F, subtitle, ctx.n); }
    const y = top + slot * (rowH + rowGap);
    rect(page, gm, y, markW, rowH, { fill: hex(pal.paper), stroke: hex(pal.accent_soft), line: 0.6 });
    const f = fit(img, markW, rowH, 9);
    page.drawImage(img, { x: (gm + markW / 2) * MM - (f.w * MM) / 2, y: yT(y + rowH / 2) - (f.h * MM) / 2, width: f.w * MM, height: f.h * MM });
    const tx = gm + markW + 12;
    text(page, tx, y + 12, String(i + 1).padStart(2, "0"), F("mono", "regular"), 8.5, hex(pal.accent), { tracking: 0.5 });
    text(page, tx, y + 27, clip(entry.name, name, 20, 210 - tx - gm), name, 20, hex(pal.ink), { tracking: displayTrack(20) });
    if (entry.types && entry.types.length)
      microLabel(page, tx, y + 35, typeLabel(entry.types), F, 7.5, hex(pal.muted), { track: 1.6 });
    const il = indLabel(entry);
    if (il) text(page, tx, y + 43, il, F("serif", "regular"), 9.5, mix(pal.muted, 0.85), { tracking: 0.2 });
    hline(page, gm, 210 - gm, y + rowH + rowGap / 2, hex(pal.accent_soft), 0.3);
  });
  return pages;
}

// Alternate engines remain available for explicit opt-in, but every studio's
// deck uses the fixed 2 × 3 grid by default — the layout never changes per
// profile (only palette / type / cover do).
const DECK_STYLES = { showcase: drawGrid, hero: drawHero, editorial: drawEditorial, contact: drawContact, duo: drawLookbook, split: drawSplit };
function drawContent(pdf, T, F, tiles, subtitle, ctx, opts = {}) {
  if (opts.layout === "lookbook") return drawLookbook(pdf, T, F, tiles, subtitle, ctx);
  const style = opts.gridStyle;                  // only an explicit override deviates
  return (DECK_STYLES[style] || drawGrid)(pdf, T, F, tiles, subtitle, ctx);
}

export async function renderSlice(src, profile, theme, entries, query, opts = {}) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${theme.name} — Logo slice`);
  pdf.setCreator("Logo Showcase · HaseebMadeIt");
  // Apply presentation overrides onto an effective theme.
  const T = { ...theme, layout: { ...theme.layout,
    tile_cols: opts.columns || 3,                 // deck defaults to 3 cols → 6 logos per page
    density: opts.density || theme.layout.density,
    cover_style: opts.coverStyle || theme.layout.cover_style } };
  const F = await makeFonts(pdf, T);
  const pal = T.palette;
  const tiles = await embedPreviews(pdf, src, profile, entries, pal.paper);
  const subtitle = opts.subtitle || titleCase(describeQuery(query.industries, query.types, query.matchAll));
  const ctx = { subtitle, n: entries.length, clientName: opts.clientName || "", dateStr: opts.dateStr || "" };
  const includeCover = opts.includeCover !== false;
  const includeClosing = opts.includeClosing !== false;

  ctx.mark = await loadBrandmark(pdf, T);
  if (includeCover) drawCover(pdf.addPage([PAGE_W, PAGE_H]), T, F, ctx);
  const contentPages = drawContent(pdf, T, F, tiles, subtitle, ctx, opts);
  if (includeClosing) drawClosing(pdf.addPage([PAGE_W, PAGE_H]), T, F, ctx);

  const total = pdf.getPageCount();
  const startNo = includeCover ? 2 : 1;
  contentPages.forEach((pg, i) => footer(pg, T, startNo + i, total));
  return pdf.save();
}

// ---- range -----------------------------------------------------------------

export async function renderRange(src, profile, theme, entries, query, opts = {}) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${theme.name} — range`);
  pdf.setCreator("Logo Showcase · HaseebMadeIt");
  const T = { ...theme, layout: { ...theme.layout,
    tile_cols: opts.columns || theme.layout.tile_cols,
    density: opts.density || theme.layout.density,
    cover_style: opts.coverStyle || theme.layout.cover_style } };
  const F = await makeFonts(pdf, T);
  const pal = T.palette;
  const tiles = await embedPreviews(pdf, src, profile, entries, pal.paper);
  const subtitle = opts.subtitle || titleCase(describeQuery(query.industries, query.types, query.matchAll));
  const title = T.labels.range_title || "Full range";
  const n = entries.length;
  const ctx = { subtitle, n, clientName: opts.clientName || "", dateStr: opts.dateStr || "" };
  const includeCover = opts.includeCover !== false;
  const includeClosing = opts.includeClosing !== false;

  ctx.mark = await loadBrandmark(pdf, T);
  if (includeCover) drawCover(pdf.addPage([PAGE_W, PAGE_H]), T, F, ctx);

  const cols = opts.columns || Math.max(4, Math.min(T.layout.tile_cols + 2, 6));
  const gap = T.layout.density === "compact" ? 4 : T.layout.density === "comfortable" ? 6 : 5;
  const gm = 14;
  const contentW = 210 - 2 * gm;
  const tileW = (contentW - gap * (cols - 1)) / cols;
  const imgH = tileW, capH = 9, tileH = imgH + capH;
  const nameFont = T.fonts.display === "Fraunces" ? F("body", "semibold") : F("display", "semibold");
  const headFont = T.fonts.display === "Fraunces" ? F("body", "bold") : F("display", "bold");

  const pages = [];
  let page = pdf.addPage([PAGE_W, PAGE_H]); page._F = F; pages.push(page);
  text(page, gm, 20, T.name, headFont, 22, hex(pal.ink));
  rect(page, gm, 24, 24, 1, { fill: hex(pal.accent) });
  text(page, gm, 30, `${title} · ${subtitle} · ${n} marks`, F("body", "regular"), 9.5, hex(pal.muted));
  const runHeader = (pg) => {
    text(pg, gm, 12, T.name, headFont, 9, hex(pal.ink));
    text(pg, 210 - gm, 12, title.toUpperCase(), F("body", "regular"), 8, hex(pal.accent), { align: "right", tracking: 1.4 });
    hline(pg, gm, 210 - gm, 15, hex(pal.accent_soft), 0.4);
  };
  let top = 38, col = 0, rowY = top;
  for (const { entry, img } of tiles) {
    if (rowY + tileH > 283) { page = pdf.addPage([PAGE_W, PAGE_H]); page._F = F; pages.push(page); runHeader(page); top = 22; rowY = top; col = 0; }
    const x = gm + col * (tileW + gap);
    rect(page, x, rowY, tileW, imgH, { fill: hex(pal.paper), stroke: hex(pal.accent_soft), line: 0.4 });
    const f = fit(img, tileW, imgH, tileW * 0.15);
    page.drawImage(img, { x: (x + tileW / 2) * MM - (f.w * MM) / 2, y: yT(rowY + imgH / 2) - (f.h * MM) / 2, width: f.w * MM, height: f.h * MM });
    text(page, x, rowY + imgH + 3.6, clip(entry.name, nameFont, 7.5, tileW), nameFont, 7.5, hex(pal.ink));
    text(page, x, rowY + imgH + 6.6, typeLabel(entry.types).toUpperCase(), F("body", "regular"), 5.4, hex(pal.muted), { tracking: 0.4 });
    if (++col >= cols) { col = 0; rowY += tileH + gap + 2; }
  }
  if (includeClosing) drawClosing(pdf.addPage([PAGE_W, PAGE_H]), T, F, ctx);

  const total = pdf.getPageCount();
  const startNo = includeCover ? 2 : 1;
  pages.forEach((pg, i) => text(pg, 105, 290, `${startNo + i} / ${total}`, F("body", "regular"), 8, hex(pal.muted), { align: "center" }));
  return pdf.save();
}

// ---- by-type ---------------------------------------------------------------
// One section per logo type, with a count header, then a grid of that type's
// marks. Sections flow across pages. Honours cover/closing + cover-style.
export async function renderByType(src, profile, theme, groups, opts = {}) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${theme.name} — by type`);
  pdf.setCreator("Logo Showcase · HaseebMadeIt");
  const T = { ...theme, layout: { ...theme.layout, cover_style: opts.coverStyle || theme.layout.cover_style } };
  const F = await makeFonts(pdf, T);
  const pal = T.palette;
  const all = groups.flatMap((g) => g.entries);
  const prepared = await embedPreviews(pdf, src, profile, all, pal.paper);
  const imgOf = new Map(prepared.map((p) => [p.entry.file, p.img]));
  const ctx = { subtitle: opts.subtitle || "By logo type", n: all.length, clientName: "", dateStr: opts.dateStr || "" };
  ctx.mark = await loadBrandmark(pdf, T);
  if (opts.includeCover !== false) drawCover(pdf.addPage([PAGE_W, PAGE_H]), T, F, ctx);

  const cols = 3, gm = 16, gap = 8, secGap = 9;
  const contentW = 210 - 2 * gm;
  const tileW = (contentW - gap * (cols - 1)) / cols;
  const imgH = tileW * 0.7, capH = 12, tileH = imgH + capH, rowGap = 9;
  const nameFont = T.fonts.display === "Fraunces" ? F("body", "semibold") : F("display", "semibold");
  const headFont = T.fonts.display === "Fraunces" ? F("body", "bold") : F("display", "bold");
  const pages = [];
  let page = null, y = 0;
  const newPage = () => {
    page = pdf.addPage([PAGE_W, PAGE_H]); page._F = F; pages.push(page);
    text(page, gm, 14, T.name, headFont, 11, hex(pal.ink));
    text(page, 210 - gm, 14, ctx.subtitle.toUpperCase(), F("body", "regular"), 8, hex(pal.accent), { align: "right", tracking: 1.4 });
    hline(page, gm, 210 - gm, 17, hex(pal.accent_soft), 0.4);
    y = 26;
  };
  newPage();
  for (const g of groups) {
    if (y + 20 > 283) newPage();
    const shown = g.entries.length, total = g.total ?? shown;
    text(page, gm, y + 4, g.type.replace(/-/g, " ").toUpperCase(), headFont, 12.5, hex(pal.ink), { tracking: 0.5 });
    text(page, 210 - gm, y + 4, total === shown ? `${total} mark${total !== 1 ? "s" : ""}` : `${shown} of ${total}`,
         F("body", "regular"), 8.5, hex(pal.muted), { align: "right" });
    hline(page, gm, 210 - gm, y + 8, hex(pal.accent), 0.6);
    y += 16;
    let col = 0;
    for (const e of g.entries) {
      if (y + tileH > 283) { newPage(); col = 0; }
      const x = gm + col * (tileW + gap);
      rect(page, x, y, tileW, imgH, { fill: hex(pal.paper), stroke: hex(pal.accent_soft), line: 0.5 });
      const img = imgOf.get(e.file);
      if (img) { const f = fit(img, tileW, imgH, tileW * 0.13); page.drawImage(img, { x: (x + tileW / 2) * MM - (f.w * MM) / 2, y: yT(y + imgH / 2) - (f.h * MM) / 2, width: f.w * MM, height: f.h * MM }); }
      text(page, x, y + imgH + 5, clip(e.name, nameFont, 9.5, tileW), nameFont, 9.5, hex(pal.ink));
      if (++col >= cols) { col = 0; y += tileH + rowGap; }
    }
    if (col !== 0) y += tileH + rowGap;
    y += secGap;
  }
  const total = pdf.getPageCount();
  const startNo = opts.includeCover !== false ? 2 : 1;
  pages.forEach((pg, i) => text(pg, 105, 290, `${startNo + i} / ${total}`, F("body", "regular"), 8, hex(pal.muted), { align: "center" }));
  return pdf.save();
}
