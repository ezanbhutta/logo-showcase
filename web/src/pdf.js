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
const _buf = new Map();
async function buf(file) {
  if (!_buf.has(file)) _buf.set(file, await fetch(`fonts/${file}`).then((r) => r.arrayBuffer()));
  return _buf.get(file);
}
async function makeFonts(pdf, theme) {
  pdf.registerFontkit(window.fontkit);
  const fams = [...new Set([theme.fonts.display, theme.fonts.body, theme.fonts.serif, "JetBrainsMono"])];
  const emb = {};
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

// Fixed-size title wrapper. Hard-wraps text into multiple lines instead of scaling it down randomly.
function wrapText(s, font, size, maxMM) {
  const words = s.split(" ");
  const lines = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? cur + " " + w : w;
    if (font.widthOfTextAtSize(test, size) <= maxMM * MM) {
      cur = test;
    } else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

// ---- typographic system ----------------------------------------------------
const caps = (s) => String(s ?? "").toUpperCase();
const displayTrack = (size) => -(size * 0.035);

function microLabel(page, x, y, s, F, size, color, { align = "left", track = size * 0.6, rotate = 0 } = {}) {
  text(page, x, y, caps(s), F("mono", "semibold"), size, color, { align, tracking: track, rotate });
}
function folio(page, x, y, no, total, F, color, align = "right") {
  text(page, x, y, `${String(no).padStart(2, "0")} / ${String(total).padStart(2, "0")}`,
    F("mono", "regular"), 7, color, { align, tracking: 1.5 });
}
function nameFonts(theme, F) {
  return {
    name: theme.fonts.display === "Fraunces" ? F("serif", "semibold") : F("display", "semibold"),
    head: theme.fonts.display === "Fraunces" ? F("body", "bold") : F("display", "bold"),
  };
}
const indLabel = (e) => (e.industries || []).slice(0, 3).map((i) => i.replace(/-/g, " ")).join("  ·  ");

// ---- architectural tile logic ---------------------------------------------
// The core geometric solution to prevent logos from bleeding into the canvas.
function drawTile(page, x, y, w, h, img, entry, F, pal, numberLabel) {
  // 1. The Strict Bounding Box
  // A stark, ultra-precise frame that separates the logo from the page canvas.
  // 3% ink overlay for subtle contrast against the paper.
  const bgFill = isLight(pal.paper) ? mix(pal.ink, 0.03) : mix(pal.ink, 0.06);
  const strokeClr = mix(pal.ink, 0.15);
  rect(page, x, y, w, h, { fill: bgFill, stroke: strokeClr, line: 0.25 });
  
  // 2. The Logo Fitting
  const pad = w * 0.15; // 15% inner padding
  const f = fit(img, w, h, pad);
  page.drawImage(img, { x: (x + w / 2) * MM - (f.w * MM) / 2, y: yT(y + h / 2) - (f.h * MM) / 2, width: f.w * MM, height: f.h * MM });
  
  // 3. The Typography (Rigid left-alignment)
  const nFont = F("display", "semibold"); 
  const ty = y + h + 6;
  
  let tx = x;
  if (numberLabel !== null) {
    text(page, tx, ty, String(numberLabel).padStart(2, "0"), F("mono", "semibold"), 7, hex(pal.accent), { tracking: 0.5 });
    tx += 8;
  }
  
  text(page, tx, ty, clip(entry.name, nFont, 10, w - (tx - x)), nFont, 10, hex(pal.ink), { tracking: displayTrack(10) });
  
  const meta = [typeLabel(entry.types), indLabel(entry)].filter(Boolean).join("    —    ");
  if (meta) {
    microLabel(page, tx, ty + 5, meta, F, 5.5, hex(pal.muted), { track: 1.5 });
  }
}

async function embedPreviews(pdf, src, profile, entries, bgHex) {
  const prepared = await Promise.all(entries.map(async (e) => {
    const blob = await src.getBlob(profile, `logos/${e.file}`);
    // Extract transparent PNG directly so it blends with the bounding box background flawlessly
    const pv = await previewPNG(blob, `${profile}/${e.file}`, 1000); 
    return { entry: e, bytes: pv.bytes };
  }));
  const out = [];
  for (const p of prepared) out.push({ entry: p.entry, img: await pdf.embedPng(p.bytes) });
  return out;
}

const _markCache = new Map();
async function loadBrandmark(pdf, theme) {
  const id = theme.id;
  if (!id) return null;
  for (const ext of ["svg", "png", "jpg"]) {
    try {
      const res = await fetch(`brand/${id}.${ext}`);
      if (!res.ok) continue;
      const ck = `${id}.${ext}`;
      let pv = _markCache.get(ck);
      if (!pv) { pv = await previewPNG(await res.blob(), `brand/${ck}`, 700); _markCache.set(ck, pv); }
      return await pdf.embedPng(pv.bytes);
    } catch { }
  }
  return null;
}
function drawMark(page, mark, xMM, topMM, heightMM, align = "left") {
  const wMM = (mark.width / mark.height) * heightMM;
  const x = align === "center" ? xMM - wMM / 2 : align === "right" ? xMM - wMM : xMM;
  page.drawImage(mark, { x: x * MM, y: yT(topMM + heightMM), width: wMM * MM, height: heightMM * MM });
  return wMM;
}


// ---- covers (Swiss Modular Grid) ----------------------------------------
function drawCover(page, theme, F, ctx) {
  const pal = theme.palette;
  const bg = hex(pal.cover_bg), fg = hex(pal.cover_fg), accent = hex(pal.accent);
  rect(page, 0, 0, 210, 297, { fill: bg });
  
  const fgMuted = isLight(pal.cover_bg) ? mix(pal.cover_fg, 0.45) : mix(pal.cover_fg, 0.5);
  const kicker = theme.labels.slice_kicker || "Selected work";
  const title = theme.name;
  const sub = ctx.subtitle;

  // Draw the fundamental geometric grid (invisible structurally, visible through alignment)
  // Left margin: 24mm. Top margin: 24mm. 
  
  if (ctx.mark) {
    drawMark(page, ctx.mark, 24, 24, 12, "left");
  }

  // Accent block: purely structural.
  rect(page, 24, 110, 8, 8, { fill: accent });
  
  microLabel(page, 24 + 14, 115, kicker, F, 8, accent, { track: 3 });

  // Fixed massive geometric typography. Left aligned perfectly.
  const dFont = F("display", "bold");
  const lines = wrapText(title, dFont, 48, 160);
  let ty = 135;
  for (const line of lines) {
    text(page, 24, ty, line, dFont, 48, fg, { tracking: displayTrack(48) });
    ty += 46;
  }
  
  // Subtitle immediately below, perfectly left aligned
  text(page, 24, ty - 20, sub, F("serif", "regular"), 16, fgMuted, { tracking: 0.5 });
  
  // Client block pushed to bottom left
  if (ctx.clientName) {
    microLabel(page, 24, 255, "Prepared for", F, 7, accent, { track: 2 });
    text(page, 24, 263, ctx.clientName, F("serif", "semibold"), 14, fg, { tracking: 0.2 });
    if (ctx.dateStr) microLabel(page, 24, 272, ctx.dateStr, F, 7, fgMuted, { track: 1.5 });
  }

  // Count pushed to bottom right
  microLabel(page, 210 - 24, 272, `${ctx.n} selected`, F, 7, fgMuted, { align: "right", track: 2.5 });
}


function runFooter(page, theme, F, pageNo, total, subtitle) {
  const pal = theme.palette;
  // Stark hairline border above the footer
  hline(page, 24, 210 - 24, 282, mix(pal.ink, 0.1), 0.25);
  text(page, 24, 288, theme.name, F("body", "bold"), 7, hex(pal.ink), { tracking: 0.5 });
  microLabel(page, 105, 288, subtitle, F, 6, hex(pal.muted), { align: "center", track: 2.5 });
  folio(page, 210 - 24, 288, pageNo, total, F, hex(pal.ink));
}

function drawClosing(page, theme, F, ctx) {
  const pal = theme.palette;
  rect(page, 0, 0, 210, 297, { fill: hex(pal.cover_bg) });
  const fg = hex(pal.cover_fg), accent = hex(pal.accent);
  
  rect(page, 105 - 4, 136 - 6, 8, 8, { fill: accent });
  microLabel(page, 105, 146, "End of Document", F, 8, accent, { align: "center", track: 3 });
  text(page, 105, 160, theme.name, F("display", "bold"), 24, fg, { align: "center", tracking: displayTrack(24) });
}

// ---- per-studio layout structures -----------------------------------------

// HERO — One massive frame perfectly centered.
function drawHero(pdf, theme, F, tiles) {
  const pal = theme.palette, pages = [];
  tiles.forEach(({ entry, img }, i) => {
    const page = pdf.addPage([PAGE_W, PAGE_H]); page._F = F; pages.push(page);
    // 140x140 perfectly centered box.
    const sz = 140, cx = 105, cy = 140; 
    drawTile(page, cx - sz/2, cy - sz/2, sz, sz, img, entry, F, pal, i + 1);
  });
  return pages;
}

// LOOKBOOK — The Asymmetric Block Grid
// Left column spans two rows. Right column has two small blocks.
function drawLookbook(pdf, theme, F, tiles) {
  const pal = theme.palette, pages = [];
  for (let i = 0; i < tiles.length; i += 3) {
    const page = pdf.addPage([PAGE_W, PAGE_H]); page._F = F; pages.push(page);
    const g = tiles.slice(i, i + 3);
    
    const mx = 24, top = 32, gap = 12;
    const fw = 210 - 2 * mx; // 162
    const bw = (fw - gap) * 0.6; // 60% for hero block
    const sw = fw - gap - bw; // 40% for small blocks
    const bh = bw; // Hero block is square
    const sh = (bh - gap) / 2; // Small blocks perfectly align to hero block height
    
    // Big block
    drawTile(page, mx, top, bw, bh, g[0].img, g[0].entry, F, pal, i + 1);
    
    // Small blocks
    if (g[1]) drawTile(page, mx + bw + gap, top, sw, sh, g[1].img, g[1].entry, F, pal, i + 2);
    if (g[2]) drawTile(page, mx + bw + gap, top + sh + gap, sw, sh, g[2].img, g[2].entry, F, pal, i + 3);
  }
  return pages;
}

// SHOWCASE (Default Grid) — Clean 2x3 Geometric frames.
function drawGrid(pdf, theme, F, tiles) {
  const pal = theme.palette, pages = [];
  const cols = 2, rowsPerPage = 3, perPage = 6;
  const gm = 24, top = 32, gapX = 12, gapY = 24, capH = 14;                                            
  const tileW = (210 - 2 * gm - gapX * (cols - 1)) / cols;
  const tileH = (240 - top - gapY * (rowsPerPage - 1)) / rowsPerPage;
  const imgH = tileH - capH;
  
  let page = null;
  tiles.forEach(({ entry, img }, i) => {
    const slot = i % perPage;
    if (slot === 0) { page = pdf.addPage([PAGE_W, PAGE_H]); page._F = F; pages.push(page); }
    const r = Math.floor(slot / cols), c = slot % cols;
    const x = gm + c * (tileW + gapX), y = top + r * (tileH + gapY);
    drawTile(page, x, y, tileW, imgH, img, entry, F, pal, i + 1);
  });
  return pages;
}

// EDITORIAL — 3 per page, one large header, two smaller footers.
function drawEditorial(pdf, theme, F, tiles) {
  const pal = theme.palette, pages = [];
  const gm = 24, fullW = 210 - 2 * gm, top = 32, bigH = 100, gap = 12, smallH = 64;
  const halfW = (fullW - gap) / 2;
  
  for (let i = 0; i < tiles.length; i += 3) {
    const page = pdf.addPage([PAGE_W, PAGE_H]); page._F = F; pages.push(page);
    const g = tiles.slice(i, i + 3);
    
    drawTile(page, gm, top, fullW, bigH, g[0].img, g[0].entry, F, pal, i + 1);
    
    const sy = top + bigH + 24;
    if (g[1]) drawTile(page, gm, sy, halfW, smallH, g[1].img, g[1].entry, F, pal, i + 2);
    if (g[2]) drawTile(page, gm + halfW + gap, sy, halfW, smallH, g[2].img, g[2].entry, F, pal, i + 3);
  }
  return pages;
}

// CONTACT — Architectural dense index (4 columns).
function drawContact(pdf, theme, F, tiles) {
  const pal = theme.palette, pages = [];
  const cols = 4, gm = 16, gap = 8, top = 30, contentW = 210 - 2 * gm;
  const tileW = (contentW - gap * (cols - 1)) / cols;
  const imgH = tileW, capH = 14, tileH = imgH + capH, rowGap = 12;
  const rowsPerPage = Math.floor((260 - top) / (tileH + rowGap));
  const perPage = cols * rowsPerPage;
  
  let page = null;
  tiles.forEach(({ entry, img }, i) => {
    const slot = i % perPage;
    if (slot === 0) { page = pdf.addPage([PAGE_W, PAGE_H]); page._F = F; pages.push(page); }
    const r = Math.floor(slot / cols), c = slot % cols;
    const x = gm + c * (tileW + gap), y = top + r * (tileH + rowGap);
    drawTile(page, x, y, tileW, imgH, img, entry, F, pal, i + 1);
  });
  return pages;
}

// SPLIT — List view tabular presentation with geometric rows.
function drawSplit(pdf, theme, F, tiles) {
  const pal = theme.palette, pages = [];
  const gm = 24, perPage = 6, top = 32, rowH = 28, rowGap = 10, markW = 42;
  let page = null;
  
  tiles.forEach(({ entry, img }, i) => {
    const slot = i % perPage;
    if (slot === 0) { page = pdf.addPage([PAGE_W, PAGE_H]); page._F = F; pages.push(page); }
    const y = top + slot * (rowH + rowGap);
    
    // The frame for the image
    const bgFill = isLight(pal.paper) ? mix(pal.ink, 0.03) : mix(pal.ink, 0.06);
    const strokeClr = mix(pal.ink, 0.15);
    rect(page, gm, y, markW, rowH, { fill: bgFill, stroke: strokeClr, line: 0.25 });
    
    const f = fit(img, markW, rowH, 6);
    page.drawImage(img, { x: (gm + markW / 2) * MM - (f.w * MM) / 2, y: yT(y + rowH / 2) - (f.h * MM) / 2, width: f.w * MM, height: f.h * MM });
    
    const tx = gm + markW + 16;
    text(page, tx, y + 6, String(i + 1).padStart(2, "0"), F("mono", "semibold"), 7, hex(pal.accent), { tracking: 0.5 });
    text(page, tx + 14, y + 6, clip(entry.name, F("display", "semibold"), 12, 210 - tx - gm - 14), F("display", "semibold"), 12, hex(pal.ink), { tracking: displayTrack(12) });
    
    const meta = [typeLabel(entry.types), indLabel(entry)].filter(Boolean).join("    —    ");
    if (meta) microLabel(page, tx + 14, y + 16, meta, F, 6, hex(pal.muted), { track: 2 });
    
    hline(page, gm, 210 - gm, y + rowH + rowGap / 2, mix(pal.ink, 0.1), 0.25);
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
  contentPages.forEach((pg, i) => runFooter(pg, T, F, startNo + i, total, subtitle));
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
  const n = entries.length;
  const ctx = { subtitle, n, clientName: opts.clientName || "", dateStr: opts.dateStr || "" };
  const includeCover = opts.includeCover !== false;
  const includeClosing = opts.includeClosing !== false;

  ctx.mark = await loadBrandmark(pdf, T);
  if (includeCover) drawCover(pdf.addPage([PAGE_W, PAGE_H]), T, F, ctx);

  const cols = opts.columns || Math.max(4, Math.min(T.layout.tile_cols + 2, 6));
  const gm = 24, gap = 8, contentW = 210 - 2 * gm;
  const tileW = (contentW - gap * (cols - 1)) / cols;
  const imgH = tileW, capH = 12, tileH = imgH + capH, rowGap = 12;
  
  const pages = [];
  let page = pdf.addPage([PAGE_W, PAGE_H]); page._F = F; pages.push(page);
  
  let top = 24, col = 0, rowY = top;
  for (let i = 0; i < tiles.length; i++) {
    const { entry, img } = tiles[i];
    if (rowY + tileH > 260) { page = pdf.addPage([PAGE_W, PAGE_H]); page._F = F; pages.push(page); top = 24; rowY = top; col = 0; }
    const x = gm + col * (tileW + gap);
    
    drawTile(page, x, rowY, tileW, imgH, img, entry, F, pal, null);
    
    if (++col >= cols) { col = 0; rowY += tileH + rowGap; }
  }
  if (includeClosing) drawClosing(pdf.addPage([PAGE_W, PAGE_H]), T, F, ctx);

  const total = pdf.getPageCount();
  const startNo = includeCover ? 2 : 1;
  pages.forEach((pg, i) => runFooter(pg, T, F, startNo + i, total, subtitle));
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

  const cols = 3, gm = 24, gap = 12, secGap = 24;
  const contentW = 210 - 2 * gm;
  const tileW = (contentW - gap * (cols - 1)) / cols;
  const imgH = tileW * 0.8, capH = 12, tileH = imgH + capH, rowGap = 12;
  
  const pages = [];
  let page = null, y = 0;
  const newPage = () => {
    page = pdf.addPage([PAGE_W, PAGE_H]); page._F = F; pages.push(page);
    y = 24;
  };
  newPage();
  for (const g of groups) {
    if (y + 36 > 260) newPage();
    const shown = g.entries.length, total = g.total ?? shown;
    microLabel(page, gm, y + 4, g.type.replace(/-/g, " "), F, 8.5, hex(pal.ink), { track: 2.5 });
    text(page, 210 - gm, y + 4, total === shown ? `${total} mark${total !== 1 ? "s" : ""}` : `${shown} of ${total}`,
         F("mono", "semibold"), 7, hex(pal.muted), { align: "right" });
    hline(page, gm, 210 - gm, y + 8, mix(pal.ink, 0.2), 0.5);
    y += 16;
    let col = 0;
    for (const e of g.entries) {
      if (y + tileH > 260) { newPage(); col = 0; }
      const x = gm + col * (tileW + gap);
      const img = imgOf.get(e.file);
      if (img) {
        drawTile(page, x, y, tileW, imgH, img, e, F, pal, null);
      }
      if (++col >= cols) { col = 0; y += tileH + rowGap; }
    }
    if (col !== 0) y += tileH + rowGap;
    y += secGap;
  }
  const total = pdf.getPageCount();
  const startNo = opts.includeCover !== false ? 2 : 1;
  pages.forEach((pg, i) => runFooter(pg, T, F, startNo + i, total, ctx.subtitle));
  return pdf.save();
}
