// Client-side, agency-grade PDF rendering with pdf-lib. Runs entirely in the
// browser — logo bytes never leave the machine. Each studio profile gets a
// distinct cover treatment, personalised cover ("Prepared for …"), running
// footers and a closing page, so the deliverable feels designed, not generated.

import { describeQuery, titleCase, typeLabel } from "./curate.js";
import { preview, previewPNG } from "./images.js";

const { PDFDocument, rgb, degrees } = window.PDFLib;

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
function mix2(c1, c2, alpha) {
  const k1 = hex(c1), k2 = hex(c2);
  return rgb(k1.red * alpha + k2.red * (1 - alpha), k1.green * alpha + k2.green * (1 - alpha), k1.blue * alpha + k2.blue * (1 - alpha));
}
function isLight(c) {
  const k = hex(c);
  return 0.2126 * k.red + 0.7152 * k.green + 0.0722 * k.blue > 0.62;
}
const yT = (mm) => PAGE_H - mm * MM;

function text(page, x, y, s, font, size, color, { align = "left", tracking = 0, rotate = 0 } = {}) {
  let w = font.widthOfTextAtSize(s, size);
  if (tracking) w += tracking * Math.max(s.length - 1, 0);
  let xpt = x * MM;
  if (align === "center") xpt -= w / 2;
  else if (align === "right") xpt -= w;
  
  const opts = { x: xpt, y: yT(y), size, font, color, ...(tracking ? { characterSpacing: tracking } : {}) };
  if (rotate !== 0) {
    opts.rotate = degrees(rotate);
    // When rotated, origin shifts, need to adjust to keep standard top-down XY logic
    if (rotate === -90) {
      if (align === "left") opts.y = yT(y) - w;
      else if (align === "right") opts.y = yT(y);
      else if (align === "center") opts.y = yT(y) - w / 2;
      opts.x = x * MM;
    }
  }
  page.drawText(s, opts);
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
// Extreme tracking for massive display text
const displayTrack = (size) => -(size * 0.035);
// A tracked small-caps micro label in the mono system face. Ultra-premium tracking.
function microLabel(page, x, y, s, F, size, color, { align = "left", track = size * 0.6, rotate = 0 } = {}) {
  text(page, x, y, caps(s), F("mono", "semibold"), size, color, { align, tracking: track, rotate });
}
// A two-up mono page folio: "03 / 12".
function folio(page, x, y, no, total, F, color, align = "right") {
  text(page, x, y, `${String(no).padStart(2, "0")} . ${String(total).padStart(2, "0")}`,
    F("mono", "regular"), 6, color, { align, tracking: 1.5 });
}

async function embedPreviews(pdf, src, profile, entries, bgHex) {
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
const _markCache = new Map();
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
  
  const fgMuted = isLight(pal.cover_bg) ? mix(pal.cover_fg, 0.45) : mix(pal.cover_fg, 0.5);

  const kicker = theme.labels.slice_kicker || "Selected work";
  const title = theme.name;
  const sub = ctx.subtitle;
  const subFont = F("serif", "regular");

  const drawClientBlock = (x, y, align = "left", rotate = 0) => {
    if (ctx.clientName) {
      microLabel(page, x, y, "Prepared for", F, 6, accent, { align, track: 2.5, rotate });
      if (rotate === -90) {
        text(page, x - 7, y, ctx.clientName, F("serif", "semibold"), 12, fg, { align, tracking: 0.2, rotate });
        if (ctx.dateStr) microLabel(page, x - 22, y, ctx.dateStr, F, 6, fgMuted, { align, track: 1.5, rotate });
      } else {
        text(page, x, y + 7, ctx.clientName, F("serif", "semibold"), 12, fg, { align, tracking: 0.2 });
        if (ctx.dateStr) microLabel(page, x, y + 15, ctx.dateStr, F, 6, fgMuted, { align, track: 1.5 });
      }
    }
  };

  const dispTitle = (x, y, max, start, min, align = "left") => {
    const size = fitTitle(title, F("display", "bold"), start, max, min);
    text(page, x, y, title, F("display", "bold"), size, fg, { align, tracking: displayTrack(size) });
    return size;
  };

  if (style === "bold") {
    // Extreme color block. Top half is accent color, bottom half is dark.
    rect(page, 0, 0, 210, 148.5, { fill: accent });
    if (ctx.mark) drawMark(page, ctx.mark, 24, 24, 12, "left");
    
    // Title sits exactly on the fold line
    const size = fitTitle(title, F("display", "bold"), 110, 190, 40);
    text(page, 105, 148.5 + size * 0.35, title, F("display", "bold"), size, bg, { align: "center", tracking: displayTrack(size) });
    
    microLabel(page, 24, 165, kicker, F, 7.5, accent, { track: 3.5 });
    text(page, 24, 178, sub, subFont, 14, mix(pal.cover_fg, 0.9), { tracking: 0.2 });
    drawClientBlock(24, 250);
    microLabel(page, 210 - 24, 273, `${ctx.n} marks`, F, 6.5, fgMuted, { align: "right", track: 2 });

  } else if (style === "serif") {
    // Architectural gridlines bleeding off edge
    hline(page, 0, 210, 32, mix(pal.cover_fg, 0.1), 0.2);
    hline(page, 0, 210, 265, mix(pal.cover_fg, 0.1), 0.2);
    vline(page, 32, 0, 297, mix(pal.cover_fg, 0.1), 0.2);
    vline(page, 210 - 32, 0, 297, mix(pal.cover_fg, 0.1), 0.2);

    if (ctx.mark) drawMark(page, ctx.mark, 105, 45, 14, "center");
    microLabel(page, 105, 110, kicker, F, 7, accent, { align: "center", track: 4.5 });
    const size = fitTitle(title, F("serif", "bold"), 80, 140, 30); // Use serif for title
    text(page, 105, 150, title, F("serif", "bold"), size, fg, { align: "center", tracking: displayTrack(size) });
    text(page, 105, 170, sub, F("body", "regular"), 12, fgMuted, { align: "center", tracking: 0.8 });
    drawClientBlock(105, 230, "center");

  } else if (style === "minimal") {
    // Brutalist minimal. Rotated text down the right spine.
    if (ctx.mark) drawMark(page, ctx.mark, 24, 24, 12, "left");
    
    microLabel(page, 24, 270, kicker, F, 8, accent, { track: 4 });
    drawClientBlock(24, 240);
    
    const size = fitTitle(title, F("display", "bold"), 130, 250, 60);
    // Rotated 90 degrees counter-clockwise, placed on right edge
    text(page, 180, 270, title, F("display", "bold"), size, fg, { align: "left", tracking: displayTrack(size), rotate: -90 });
    text(page, 165, 270, sub, subFont, 14, fgMuted, { align: "left", tracking: 0.5, rotate: -90 });

  } else if (style === "gridlines") {
    // Math-driven Swiss modular grid
    const grid = mix(pal.cover_fg, isLight(pal.cover_bg) ? 0.08 : 0.05);
    for (let gx = 16; gx <= 194; gx += 17.8) vline(page, gx, 0, 297, grid, 0.1);
    for (let gy = 16; gy <= 281; gy += 17.8) hline(page, 0, 210, gy, grid, 0.1);
    
    const mx = 33.8; // Align to grid
    microLabel(page, mx, 51.6, kicker, F, 7, accent, { track: 3.5 });
    const size = fitTitle(title, F("display", "bold"), 80, 210 - 2 * mx, 34);
    text(page, mx, 105, title, F("display", "bold"), size, fg, { align: "left", tracking: displayTrack(size) });
    rect(page, mx, 120, 35.6, 1, { fill: accent });
    text(page, mx, 132, sub, subFont, 12, mix(pal.cover_fg, 0.85), { tracking: 0.3 });
    drawClientBlock(mx, 247.4);
    microLabel(page, 194, 265.2, `${ctx.n} marks`, F, 6, mix(pal.cover_fg, 0.5), { align: "right", track: 2.5 });

  } else {
    // editorial (default) — confident asymmetric tension
    if (ctx.mark) drawMark(page, ctx.mark, 24, 24, 12, "left");
    const mx = 24;
    microLabel(page, mx, 100, kicker, F, 7.5, accent, { track: 3.5 });
    rect(page, mx, 108, 48, 0.8, { fill: accent });
    const size = fitTitle(title, F("display", "bold"), 90, 210 - 2 * mx, 40);
    text(page, mx, 140, title, F("display", "bold"), size, fg, { tracking: displayTrack(size) });
    text(page, mx, 155, sub, subFont, 14, mix(pal.cover_fg, 0.85), { tracking: 0.3 });
    drawClientBlock(mx, 250);
    microLabel(page, 210 - 24, 273, `${ctx.n} selected`, F, 6.5, fgMuted, { align: "right", track: 2.5 });
  }
}

// ---- running footer (content pages) ---------------------------------------

function runFooter(page, theme, F, pageNo, total, subtitle, n) {
  const pal = theme.palette;
  // Hairline grid at the bottom
  hline(page, 0, 210, 280, mix(pal.ink, 0.1), 0.1);
  text(page, 16, 286, theme.name, F("body", "bold"), 7, hex(pal.ink), { tracking: 0.5 });
  microLabel(page, 105, 286, subtitle, F, 5.5, hex(pal.muted), { align: "center", track: 3 });
  folio(page, 210 - 16, 286, pageNo, total, F, hex(pal.ink));
}

// ---- closing page ----------------------------------------------------------

function drawClosing(page, theme, F, ctx) {
  const pal = theme.palette;
  rect(page, 0, 0, 210, 297, { fill: hex(pal.cover_bg) });
  const fg = hex(pal.cover_fg), accent = hex(pal.accent);
  microLabel(page, 105, 136, "End of Document", F, 7.5, accent, { align: "center", track: 4 });
  const size = fitTitle(theme.name, F("display", "bold"), 60, 190, 24);
  text(page, 105, 160, theme.name, F("display", "bold"), size, fg, { align: "center", tracking: displayTrack(size) });
  rect(page, 95, 175, 20, 1, { fill: accent });
}

// ---- per-studio layout structures -----------------------------------------

function nameFonts(theme, F) {
  return {
    name: theme.fonts.display === "Fraunces" ? F("serif", "semibold") : F("display", "semibold"),
    head: theme.fonts.display === "Fraunces" ? F("body", "bold") : F("display", "bold"),
  };
}
const indLabel = (e) => (e.industries || []).slice(0, 3).map((i) => i.replace(/-/g, " ")).join("  ·  ");

// HERO — Extreme negative space. 1 mark per page.
function drawHero(pdf, theme, F, tiles, subtitle, ctx) {
  const pal = theme.palette, { name } = nameFonts(theme, F), pages = [];
  
  tiles.forEach(({ entry, img }, i) => {
    const page = pdf.addPage([PAGE_W, PAGE_H]); page._F = F; pages.push(page);
    
    // Draw crosshairs around the image frame to give it a technical, architectural feel
    const cx = 105, cy = 148.5, sz = 130;
    const x = cx - sz/2, y = cy - sz/2;
    
    hline(page, 0, 210, y, mix(pal.ink, 0.05), 0.1);
    hline(page, 0, 210, y + sz, mix(pal.ink, 0.05), 0.1);
    vline(page, x, 0, 297, mix(pal.ink, 0.05), 0.1);
    vline(page, x + sz, 0, 297, mix(pal.ink, 0.05), 0.1);

    const f = fit(img, sz, sz, 16);
    page.drawImage(img, { x: cx * MM - (f.w * MM) / 2, y: yT(cy) - (f.h * MM) / 2, width: f.w * MM, height: f.h * MM });
    
    // Massive typography at the bottom left, locking into the crosshair
    text(page, x, y + sz + 12, String(i + 1).padStart(2, "0"), F("mono", "semibold"), 6, hex(pal.accent), { tracking: 0.5 });
    const nsize = fitTitle(entry.name, name, 24, sz, 14);
    text(page, x, y + sz + 24, entry.name, name, nsize, hex(pal.ink), { tracking: displayTrack(nsize) });
    const meta = [typeLabel(entry.types), indLabel(entry)].filter(Boolean).join("    —    ");
    if (meta) microLabel(page, x, y + sz + 32, meta, F, 6, hex(pal.muted), { track: 2 });
  });
  return pages;
}

// LOOKBOOK — The Asymmetric Spread. Mathematically paced scale shifts.
function drawLookbook(pdf, theme, F, tiles, subtitle, ctx) {
  const pal = theme.palette, { name } = nameFonts(theme, F), pages = [];
  
  // Group tiles into pages. We will use a Golden Ratio / Rule of Thirds layout.
  // One huge image, two small images per page.
  for (let i = 0; i < tiles.length; i += 3) {
    const page = pdf.addPage([PAGE_W, PAGE_H]); page._F = F; pages.push(page);
    const g = tiles.slice(i, i + 3);
    
    // Grid lines for structure
    const mx = 20, my = 20, fullW = 210 - 2 * mx, fullH = 250 - 2 * my;
    const splitY = my + (fullH * 0.65); // 65% for the hero image
    const gap = 16;
    const smallW = (fullW - gap) / 2;
    const smallH = fullH - (splitY - my) - gap;
    
    const tile = (pg, x, y, w, h, entry, img) => {
      // No backgrounds, pure negative space
      const f = fit(img, w, h, w * 0.15);
      pg.drawImage(img, { x: (x + w / 2) * MM - (f.w * MM) / 2, y: yT(y + h / 2) - (f.h * MM) / 2, width: f.w * MM, height: f.h * MM });
      
      const ns = w > 100 ? 16 : 10;
      text(pg, x, y + h + (w > 100 ? 10 : 6), clip(entry.name, name, ns, w), name, ns, hex(pal.ink), { tracking: displayTrack(ns) });
      if (entry.types && entry.types.length)
        microLabel(pg, x, y + h + (w > 100 ? 16 : 10), typeLabel(entry.types), F, w > 100 ? 6 : 5, hex(pal.muted), { track: w > 100 ? 2 : 1.5 });
    };

    // Hero image spans the top 65%
    tile(page, mx, my, fullW, splitY - my, g[0].entry, g[0].img);
    // Secondary images span the bottom 35%, split into two columns
    if (g[1]) tile(page, mx, splitY + gap, smallW, smallH, g[1].entry, g[1].img);
    if (g[2]) tile(page, mx + smallW + gap, splitY + gap, smallW, smallH, g[2].entry, g[2].img);
  }
  return pages;
}

// SHOWCASE (Default Grid) — Clean 2x3 but with tighter typographic locks.
function drawGrid(pdf, theme, F, tiles, subtitle, ctx) {
  const pal = theme.palette, { name } = nameFonts(theme, F), pages = [];
  const cols = 2, rowsPerPage = 3, perPage = 6;
  const gm = 24, top = 32, gapX = 16, gapY = 24, capH = 14;                                            
  const tileW = (210 - 2 * gm - gapX * (cols - 1)) / cols;
  const tileH = (240 - top - gapY * (rowsPerPage - 1)) / rowsPerPage;
  const imgH = tileH - capH, pad = tileW * 0.15;                                   
  
  let page = null;
  tiles.forEach(({ entry, img }, i) => {
    const slot = i % perPage;
    if (slot === 0) { page = pdf.addPage([PAGE_W, PAGE_H]); page._F = F; pages.push(page); }
    const r = Math.floor(slot / cols), c = slot % cols;
    const x = gm + c * (tileW + gapX), y = top + r * (tileH + gapY);
    
    const f = fit(img, tileW, imgH, pad);
    page.drawImage(img, { x: (x + tileW / 2) * MM - (f.w * MM) / 2, y: yT(y + imgH / 2) - (f.h * MM) / 2, width: f.w * MM, height: f.h * MM });
    
    text(page, x, y + imgH + 8, String(i + 1).padStart(2, "0"), F("mono", "semibold"), 6, hex(pal.accent), { tracking: 0.5 });
    text(page, x + 12, y + imgH + 8, clip(entry.name, name, 10, tileW - 12), name, 10, hex(pal.ink), { tracking: displayTrack(10) });
    if (entry.types && entry.types.length)
      microLabel(page, x + 12, y + imgH + 13, typeLabel(entry.types), F, 5, hex(pal.muted), { track: 1.5 });
  });
  return pages;
}

// EDITORIAL — 3 per page.
function drawEditorial(pdf, theme, F, tiles, subtitle, ctx) {
  const pal = theme.palette, { name } = nameFonts(theme, F), pages = [];
  const gm = 20, fullW = 210 - 2 * gm, top = 24, bigH = 140, smallTop = 180, smallH = 70, gap = 16, halfW = (fullW - gap) / 2;
  
  const tile = (pg, x, y, w, h, entry, img, big) => {
    const f = fit(img, w, h, big ? 32 : 16);
    pg.drawImage(img, { x: (x + w / 2) * MM - (f.w * MM) / 2, y: yT(y + h / 2) - (f.h * MM) / 2, width: f.w * MM, height: f.h * MM });
    const ny = y + h + (big ? 8 : 6);
    const ns = big ? 14 : 10;
    text(pg, x, ny, clip(entry.name, name, ns, w), name, ns, hex(pal.ink), { tracking: displayTrack(ns) });
    if (entry.types && entry.types.length)
      microLabel(pg, x, ny + (big ? 6 : 5), typeLabel(entry.types), F, big ? 6 : 5, hex(pal.muted), { track: big ? 2 : 1.5 });
  };
  
  for (let i = 0; i < tiles.length; i += 3) {
    const page = pdf.addPage([PAGE_W, PAGE_H]); page._F = F; pages.push(page);
    const g = tiles.slice(i, i + 3);
    tile(page, gm, top, fullW, bigH, g[0].entry, g[0].img, true);
    if (g[1]) tile(page, gm, smallTop, halfW, smallH, g[1].entry, g[1].img, false);
    if (g[2]) tile(page, gm + halfW + gap, smallTop, halfW, smallH, g[2].entry, g[2].img, false);
  }
  return pages;
}

// CONTACT — Architectural dense index (4 columns with bleeding hairlines).
function drawContact(pdf, theme, F, tiles, subtitle, ctx) {
  const pal = theme.palette, { name } = nameFonts(theme, F), pages = [];
  const cols = 4, gm = 20, gap = 0, top = 30, contentW = 210 - 2 * gm;
  const tileW = (contentW - gap * (cols - 1)) / cols, imgH = tileW, capH = 14, tileH = imgH + capH, rowGap = 0;
  const rowsPerPage = Math.floor((250 - top) / tileH), perPage = cols * rowsPerPage;
  
  let page = null;
  tiles.forEach(({ entry, img }, i) => {
    const slot = i % perPage;
    if (slot === 0) { 
      page = pdf.addPage([PAGE_W, PAGE_H]); page._F = F; pages.push(page); 
      // Draw massive vertical hairlines across the whole page
      for (let c = 0; c <= cols; c++) vline(page, gm + c * tileW, 0, 297, mix(pal.ink, 0.08), 0.15);
    }
    const r = Math.floor(slot / cols), c = slot % cols;
    const x = gm + c * tileW, y = top + r * tileH;
    
    // Draw horizontal hairline
    hline(page, 0, 210, y, mix(pal.ink, 0.08), 0.15);
    if (slot >= perPage - cols || i === tiles.length - 1) hline(page, 0, 210, y + tileH, mix(pal.ink, 0.08), 0.15);

    const f = fit(img, tileW, imgH, tileW * 0.15);
    page.drawImage(img, { x: (x + tileW / 2) * MM - (f.w * MM) / 2, y: yT(y + imgH / 2) - (f.h * MM) / 2, width: f.w * MM, height: f.h * MM });
    
    text(page, x + 4, y + imgH + 4, String(i + 1).padStart(2, "0"), F("mono", "semibold"), 5, hex(pal.accent), { tracking: 0.5 });
    text(page, x + 12, y + imgH + 4, clip(entry.name, name, 7, tileW - 16), name, 7, hex(pal.ink));
    if (entry.types && entry.types.length)
      microLabel(page, x + 12, y + imgH + 8.5, typeLabel(entry.types), F, 4.5, hex(pal.muted), { track: 1 });
  });
  return pages;
}

// SPLIT — List view, tabular presentation.
function drawSplit(pdf, theme, F, tiles, subtitle, ctx) {
  const pal = theme.palette, { name } = nameFonts(theme, F), pages = [];
  const gm = 24, perPage = 5, top = 36, rowH = 36, rowGap = 8, markW = 54;
  let page = null;
  
  tiles.forEach(({ entry, img }, i) => {
    const slot = i % perPage;
    if (slot === 0) { 
      page = pdf.addPage([PAGE_W, PAGE_H]); page._F = F; pages.push(page); 
      hline(page, gm, 210 - gm, top - rowGap, mix(pal.ink, 0.1), 0.2);
    }
    const y = top + slot * (rowH + rowGap);
    
    const f = fit(img, markW, rowH, 8);
    page.drawImage(img, { x: (gm + markW / 2) * MM - (f.w * MM) / 2, y: yT(y + rowH / 2) - (f.h * MM) / 2, width: f.w * MM, height: f.h * MM });
    
    const tx = gm + markW + 16;
    text(page, tx, y + 10, String(i + 1).padStart(2, "0"), F("mono", "semibold"), 6.5, hex(pal.accent), { tracking: 0.5 });
    text(page, tx, y + 20, clip(entry.name, name, 13, 210 - tx - gm), name, 13, hex(pal.ink), { tracking: displayTrack(13) });
    if (entry.types && entry.types.length)
      microLabel(page, tx, y + 28, typeLabel(entry.types), F, 6, hex(pal.muted), { track: 2 });
    
    hline(page, gm, 210 - gm, y + rowH + rowGap / 2, mix(pal.ink, 0.1), 0.2);
  });
  return pages;
}

const DECK_STYLES = { showcase: drawGrid, hero: drawHero, editorial: drawEditorial, contact: drawContact, duo: drawLookbook, split: drawSplit };
function drawContent(pdf, T, F, tiles, subtitle, ctx, opts = {}) {
  if (opts.layout === "lookbook") return drawLookbook(pdf, T, F, tiles, subtitle, ctx);
  const style = opts.gridStyle;                  
  return (DECK_STYLES[style] || drawGrid)(pdf, T, F, tiles, subtitle, ctx);
}

export async function renderSlice(src, profile, theme, entries, query, opts = {}) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${theme.name} — Logo slice`);
  pdf.setCreator("Logo Showcase · HaseebMadeIt");
  const T = { ...theme, layout: { ...theme.layout,
    tile_cols: opts.columns || 3,                 
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
  contentPages.forEach((pg, i) => runFooter(pg, T, F, startNo + i, total, subtitle, entries.length));
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
  const gm = 24, gap = 8, contentW = 210 - 2 * gm;
  const tileW = (contentW - gap * (cols - 1)) / cols;
  const imgH = tileW, capH = 10, tileH = imgH + capH;
  const nameFont = T.fonts.display === "Fraunces" ? F("body", "semibold") : F("display", "semibold");
  
  const pages = [];
  let page = pdf.addPage([PAGE_W, PAGE_H]); page._F = F; pages.push(page);
  
  let top = 24, col = 0, rowY = top;
  for (const { entry, img } of tiles) {
    if (rowY + tileH > 260) { page = pdf.addPage([PAGE_W, PAGE_H]); page._F = F; pages.push(page); top = 24; rowY = top; col = 0; }
    const x = gm + col * (tileW + gap);
    const f = fit(img, tileW, imgH, tileW * 0.15);
    page.drawImage(img, { x: (x + tileW / 2) * MM - (f.w * MM) / 2, y: yT(rowY + imgH / 2) - (f.h * MM) / 2, width: f.w * MM, height: f.h * MM });
    text(page, x, rowY + imgH + 4, clip(entry.name, nameFont, 6.5, tileW), nameFont, 6.5, hex(pal.ink));
    microLabel(page, x, rowY + imgH + 7, typeLabel(entry.types), F, 4.5, hex(pal.muted), { track: 1 });
    if (++col >= cols) { col = 0; rowY += tileH + gap + 4; }
  }
  if (includeClosing) drawClosing(pdf.addPage([PAGE_W, PAGE_H]), T, F, ctx);

  const total = pdf.getPageCount();
  const startNo = includeCover ? 2 : 1;
  pages.forEach((pg, i) => runFooter(pg, T, F, startNo + i, total, subtitle, entries.length));
  return pdf.save();
}

// ---- by-type ---------------------------------------------------------------
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

  const cols = 3, gm = 24, gap = 16, secGap = 20;
  const contentW = 210 - 2 * gm;
  const tileW = (contentW - gap * (cols - 1)) / cols;
  const imgH = tileW * 0.7, capH = 12, tileH = imgH + capH, rowGap = 16;
  const nameFont = T.fonts.display === "Fraunces" ? F("body", "semibold") : F("display", "semibold");
  
  const pages = [];
  let page = null, y = 0;
  const newPage = () => {
    page = pdf.addPage([PAGE_W, PAGE_H]); page._F = F; pages.push(page);
    y = 24;
  };
  newPage();
  for (const g of groups) {
    if (y + 24 > 260) newPage();
    const shown = g.entries.length, total = g.total ?? shown;
    microLabel(page, gm, y + 4, g.type.replace(/-/g, " "), F, 8.5, hex(pal.ink), { track: 2.5 });
    text(page, 210 - gm, y + 4, total === shown ? `${total} mark${total !== 1 ? "s" : ""}` : `${shown} of ${total}`,
         F("body", "regular"), 7.5, hex(pal.muted), { align: "right" });
    hline(page, gm, 210 - gm, y + 8, hex(pal.accent), 0.4);
    y += 18;
    let col = 0;
    for (const e of g.entries) {
      if (y + tileH > 260) { newPage(); col = 0; }
      const x = gm + col * (tileW + gap);
      const img = imgOf.get(e.file);
      if (img) { const f = fit(img, tileW, imgH, tileW * 0.13); page.drawImage(img, { x: (x + tileW / 2) * MM - (f.w * MM) / 2, y: yT(y + imgH / 2) - (f.h * MM) / 2, width: f.w * MM, height: f.h * MM }); }
      text(page, x, y + imgH + 6, clip(e.name, nameFont, 8.5, tileW), nameFont, 8.5, hex(pal.ink));
      if (++col >= cols) { col = 0; y += tileH + rowGap; }
    }
    if (col !== 0) y += tileH + rowGap;
    y += secGap;
  }
  const total = pdf.getPageCount();
  const startNo = opts.includeCover !== false ? 2 : 1;
  pages.forEach((pg, i) => runFooter(pg, T, F, startNo + i, total, ctx.subtitle, all.length));
  return pdf.save();
}
