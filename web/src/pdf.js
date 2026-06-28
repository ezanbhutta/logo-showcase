// Client-side, agency-grade PDF rendering with pdf-lib. Runs entirely in the
// browser — logo bytes never leave the machine. Each studio profile gets a
// distinct cover treatment, personalised cover ("Prepared for …"), running
// footers and a closing page, so the deliverable feels designed, not generated.

import { describeQuery, titleCase, typeLabel } from "./curate.js";
import { preview } from "./images.js";

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
};
const _buf = new Map();
async function buf(file) {
  if (!_buf.has(file)) _buf.set(file, await fetch(`fonts/${file}`).then((r) => r.arrayBuffer()));
  return _buf.get(file);
}
async function makeFonts(pdf, theme) {
  pdf.registerFontkit(window.fontkit);
  const fams = [...new Set([theme.fonts.display, theme.fonts.body, theme.fonts.serif])];
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
    const fam = theme.fonts[role] || "Archivo";
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

// ---- covers (one per studio style) ----------------------------------------

function drawCover(page, theme, F, ctx) {
  const pal = theme.palette;
  const style = theme.layout.cover_style || "editorial";
  const bg = hex(pal.cover_bg), fg = hex(pal.cover_fg), accent = hex(pal.accent);
  rect(page, 0, 0, 210, 297, { fill: bg });
  const fgMuted = isLight(pal.cover_bg) ? mix(pal.cover_fg, 0.55) : mix(pal.cover_fg, 0.6);

  const kicker = (theme.labels.slice_kicker || "Selected work").toUpperCase();
  const title = theme.name;
  const sub = ctx.subtitle;
  // Fraunces leans on kerning that pdf-lib can't apply, so for body-size text we
  // fall back to the studio's clean sans; the display title keeps its character.
  const small = theme.fonts.serif === "Fraunces" ? F("body", "regular") : F("serif", "regular");

  const drawClientBlock = (x, y, align = "left") => {
    if (ctx.clientName) {
      text(page, x, y, "PREPARED FOR", F("body", "semibold"), 7.5, accent, { align, tracking: 1.8 });
      text(page, x, y + 6, ctx.clientName, small, 13, fg, { align });
    }
    if (ctx.dateStr) text(page, x, y + (ctx.clientName ? 12 : 0), ctx.dateStr, F("body", "regular"), 9, fgMuted, { align });
  };

  if (style === "bold") {
    const mx = 22;
    text(page, mx, 70, kicker, F("body", "semibold"), 10, accent, { tracking: 2.6 });
    const size = fitTitle(title, F("display", "bold"), 78, 210 - 2 * mx, 40);
    text(page, mx, 132, title, F("display", "bold"), size, fg);
    rect(page, mx, 140, 30, 1.2, { fill: accent });
    text(page, mx, 152, sub, small, 15, mix(pal.cover_fg, 0.9));
    drawClientBlock(mx, 235);
    text(page, 210 - mx, 273, `${ctx.n} marks`, F("body", "regular"), 9.5, fgMuted, { align: "right" });

  } else if (style === "serif") {
    // centered, framed, elegant
    rect(page, 16, 16, 178, 265, { stroke: mix(pal.cover_fg, 0.28), line: 0.6 });
    text(page, 105, 60, kicker, F("body", "regular"), 9, accent, { align: "center", tracking: 3.2 });
    const size = fitTitle(title, F("display", "semibold"), 56, 150, 30);
    text(page, 105, 142, title, F("display", "semibold"), size, fg, { align: "center" });
    hline(page, 90, 120, 152, accent, 1);
    text(page, 105, 166, sub, small, 14, mix(pal.cover_fg, 0.85), { align: "center" });
    drawClientBlock(105, 232, "center");

  } else if (style === "minimal") {
    // light, lots of air, index feel
    const mx = 22;
    text(page, mx, 40, kicker, F("body", "semibold"), 8, accent, { tracking: 2.4 });
    const size = fitTitle(title, F("display", "bold"), 44, 210 - 2 * mx, 26);
    text(page, mx, 70, title, F("display", "bold"), size, fg);
    text(page, mx, 84, sub, F("body", "regular"), 12, mix(pal.cover_fg, 0.6));
    hline(page, mx, 210 - mx, 250, mix(pal.cover_fg, 0.25), 0.5);
    drawClientBlock(mx, 262);
    text(page, 210 - mx, 268, `${ctx.n} marks`, F("body", "regular"), 9, mix(pal.cover_fg, 0.55), { align: "right" });

  } else if (style === "gridlines") {
    // technical grid
    const grid = mix(pal.cover_fg, isLight(pal.cover_bg) ? 0.12 : 0.1);
    for (let gx = 22; gx <= 188; gx += logoStep(166, 6)) vline(page, gx, 22, 275, grid, 0.3);
    for (let gy = 40; gy <= 275; gy += 26) hline(page, 22, 188, gy, grid, 0.3);
    const mx = 22;
    text(page, mx, 36, kicker, F("body", "semibold"), 9, accent, { tracking: 2.2 });
    const size = fitTitle(title, F("display", "bold"), 62, 210 - 2 * mx, 34);
    text(page, mx, 122, title, F("display", "bold"), size, fg);
    rect(page, mx, 128, 26, 1.2, { fill: accent });
    text(page, mx, 140, sub, F("body", "regular"), 13, mix(pal.cover_fg, 0.85));
    drawClientBlock(mx, 240);
    text(page, 188, 269, `${ctx.n} marks`, F("body", "regular"), 9, mix(pal.cover_fg, 0.6), { align: "right" });

  } else {
    // editorial (default) — asymmetric magazine layout
    const mx = 24;
    text(page, mx, 88, kicker, F("body", "semibold"), 10, accent, { tracking: 2.4 });
    rect(page, mx, 93, 30, 1, { fill: accent });
    const size = fitTitle(title, F("display", "bold"), 52, 210 - 2 * mx, 30);
    text(page, mx, 120, title, F("display", "bold"), size, fg);
    text(page, mx, 135, sub, small, 15, mix(pal.cover_fg, 0.85));
    drawClientBlock(mx, 238);
    text(page, 210 - mx, 273, `${ctx.n} selected · curated slice`, F("body", "regular"), 9, fgMuted, { align: "right" });
  }
}

function logoStep(span, cols) { return span / cols; }

// ---- running footer (content pages) ---------------------------------------

function footer(page, theme, pageNo, total) {
  const pal = theme.palette;
  hline(page, 14, 196, 285, hex(pal.accent_soft), 0.4);
  text(page, 14, 290, theme.name, page._F("body", "semibold"), 8, hex(pal.muted));
  text(page, 105, 290, (theme.labels.slice_kicker || "").toUpperCase(), page._F("body", "regular"), 7, mix(pal.muted, 0.9), { align: "center", tracking: 1.4 });
  text(page, 196, 290, `${pageNo} / ${total}`, page._F("body", "regular"), 8, hex(pal.muted), { align: "right" });
}

// ---- closing page ----------------------------------------------------------

function drawClosing(page, theme, F, ctx) {
  const pal = theme.palette;
  rect(page, 0, 0, 210, 297, { fill: hex(pal.cover_bg) });
  const fg = hex(pal.cover_fg), accent = hex(pal.accent);
  text(page, 105, 120, (theme.labels.slice_kicker ? "LET’S MAKE YOURS" : "LET’S MAKE YOURS"),
       F("body", "semibold"), 9, accent, { align: "center", tracking: 2.6 });
  const size = fitTitle(theme.name, F("display", "bold"), 40, 170, 24);
  text(page, 105, 150, theme.name, F("display", "bold"), size, fg, { align: "center" });
  hline(page, 92, 118, 160, accent, 1);
  const small = theme.fonts.serif === "Fraunces" ? F("body", "regular") : F("serif", "regular");
  if (ctx.clientName) text(page, 105, 180, `Prepared for ${ctx.clientName}`, small, 13, mix(pal.cover_fg, 0.85), { align: "center" });
  if (ctx.dateStr) text(page, 105, 190, ctx.dateStr, F("body", "regular"), 9, mix(pal.cover_fg, 0.6), { align: "center" });
}

// ---- slice -----------------------------------------------------------------

function drawGrid(pdf, theme, F, tiles, subtitle, ctx) {
  const pal = theme.palette;
  const cols = theme.layout.tile_cols;
  const gm = 16, top = 34;
  const gap = theme.layout.density === "comfortable" ? 9 : 6;
  const contentW = 210 - 2 * gm;
  const tileW = (contentW - gap * (cols - 1)) / cols;
  const imgH = tileW * 0.74, capH = 13, tileH = imgH + capH, rowGap = gap + 4;
  const nameFont = theme.fonts.display === "Fraunces" ? F("body", "semibold") : F("display", "semibold");
  const headerFont = theme.fonts.display === "Fraunces" ? F("body", "bold") : F("display", "bold");
  const header = (pg) => {
    text(pg, gm, top - 12, theme.name, headerFont, 14, hex(pal.ink));
    text(pg, 210 - gm, top - 12, `${subtitle} · ${ctx.n} marks`, F("body", "regular"), 9, hex(pal.muted), { align: "right" });
    hline(pg, gm, 210 - gm, top - 7, hex(pal.accent), 0.8);
  };
  const pages = [];
  let page = pdf.addPage([PAGE_W, PAGE_H]); page._F = F; pages.push(page); header(page);
  let col = 0, rowY = top, idx = 0;
  for (const { entry, img } of tiles) {
    if (rowY + tileH > 278) { page = pdf.addPage([PAGE_W, PAGE_H]); page._F = F; pages.push(page); header(page); rowY = top; col = 0; }
    const x = gm + col * (tileW + gap);
    rect(page, x, rowY, tileW, imgH, { fill: hex(pal.paper), stroke: hex(pal.accent_soft), line: 0.6 });
    const f = fit(img, tileW, imgH, tileW * 0.13);
    page.drawImage(img, { x: (x + tileW / 2) * MM - (f.w * MM) / 2, y: yT(rowY + imgH / 2) - (f.h * MM) / 2, width: f.w * MM, height: f.h * MM });
    text(page, x, rowY + imgH + 5.5, String(++idx).padStart(2, "0"), F("body", "semibold"), 7, hex(pal.accent), { tracking: 0.5 });
    text(page, x + 8, rowY + imgH + 5.5, clip(entry.name, nameFont, 10.5, tileW - 8), nameFont, 10.5, hex(pal.ink));
    text(page, x + 8, rowY + imgH + 9.6, typeLabel(entry.types).toUpperCase(), F("body", "regular"), 6.6, hex(pal.muted), { tracking: 0.8 });
    if (++col >= cols) { col = 0; rowY += tileH + rowGap; }
  }
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
    text(pg, mx, 16, theme.name, headerFont, 12, hex(pal.ink));
    text(pg, 210 - mx, 16, `${subtitle} · ${ctx.n} marks`, F("body", "regular"), 8.5, hex(pal.muted), { align: "right" });
    hline(pg, mx, 210 - mx, 19, hex(pal.accent_soft), 0.4);
  };
  const pages = []; let page = null, slot = 0, idx = 0;
  for (const { entry, img } of tiles) {
    if (slot === 0) { page = pdf.addPage([PAGE_W, PAGE_H]); page._F = F; pages.push(page); header(page); }
    const sy = top + slot * (slotH + slotGap);
    rect(page, mx, sy, frameW, frameH, { fill: hex(pal.paper), stroke: hex(pal.accent_soft), line: 0.6 });
    const f = fit(img, frameW, frameH, 18);
    page.drawImage(img, { x: (mx + frameW / 2) * MM - (f.w * MM) / 2, y: yT(sy + frameH / 2) - (f.h * MM) / 2, width: f.w * MM, height: f.h * MM });
    const cy = sy + frameH + 8;
    text(page, mx, cy, String(++idx).padStart(2, "0"), F("body", "semibold"), 8, hex(pal.accent), { tracking: 0.5 });
    text(page, mx + 9, cy, clip(entry.name, nameFont, 16, frameW - 45), nameFont, 16, hex(pal.ink));
    text(page, 210 - mx, cy, typeLabel(entry.types).toUpperCase(), F("body", "regular"), 8, hex(pal.muted), { align: "right", tracking: 1 });
    text(page, mx + 9, cy + 5.5, entry.industries.slice(0, 3).map((i) => i.replace(/-/g, " ")).join("  ·  "), F("body", "regular"), 7.5, mix(pal.muted, 0.85));
    slot = (slot + 1) % perPage;
  }
  return pages;
}

export async function renderSlice(src, profile, theme, entries, query, opts = {}) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${theme.name} — Logo slice`);
  pdf.setCreator("Logo Showcase · HaseebMadeIt");
  // Apply presentation overrides onto an effective theme.
  const T = { ...theme, layout: { ...theme.layout,
    tile_cols: opts.columns || theme.layout.tile_cols,
    density: opts.density || theme.layout.density,
    cover_style: opts.coverStyle || theme.layout.cover_style } };
  const F = await makeFonts(pdf, T);
  const pal = T.palette;
  const tiles = await embedPreviews(pdf, src, profile, entries, pal.paper);
  const subtitle = titleCase(describeQuery(query.industries, query.types, query.matchAll));
  const ctx = { subtitle, n: entries.length, clientName: opts.clientName || "", dateStr: opts.dateStr || "" };
  const includeCover = opts.includeCover !== false;
  const includeClosing = opts.includeClosing !== false;

  if (includeCover) drawCover(pdf.addPage([PAGE_W, PAGE_H]), T, F, ctx);
  const contentPages = (opts.layout === "lookbook" ? drawLookbook : drawGrid)(pdf, T, F, tiles, subtitle, ctx);
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
  const F = await makeFonts(pdf, theme);
  const pal = theme.palette;
  const tiles = await embedPreviews(pdf, src, profile, entries, pal.paper);
  const subtitle = titleCase(describeQuery(query.industries, query.types, query.matchAll));
  const title = theme.labels.range_title || "Full range";
  const n = entries.length;

  const cols = Math.max(4, Math.min(theme.layout.tile_cols + 2, 6));
  const gm = 14, gap = 5;
  const contentW = 210 - 2 * gm;
  const tileW = (contentW - gap * (cols - 1)) / cols;
  const imgH = tileW, capH = 9, tileH = imgH + capH;

  let page = pdf.addPage([PAGE_W, PAGE_H]); page._F = F;
  text(page, gm, 20, theme.name, F("display", "bold"), 22, hex(pal.ink));
  rect(page, gm, 24, 24, 1, { fill: hex(pal.accent) });
  text(page, gm, 30, `${title} · ${subtitle} · ${n} marks`, F("body", "regular"), 9.5, hex(pal.muted));
  const smallSerif = theme.fonts.serif === "Fraunces" ? F("body", "regular") : F("serif", "regular");
  if (opts.clientName) text(page, 210 - gm, 20, `For ${opts.clientName}`, smallSerif, 11, hex(pal.muted), { align: "right" });
  const pages = [page];
  const runHeader = (pg) => {
    text(pg, gm, 12, theme.name, F("display", "bold"), 9, hex(pal.ink));
    text(pg, 210 - gm, 12, title.toUpperCase(), F("body", "regular"), 8, hex(pal.accent), { align: "right", tracking: 1.4 });
    hline(pg, gm, 210 - gm, 15, hex(pal.accent_soft), 0.4);
  };

  const nameFont = theme.fonts.display === "Fraunces" ? F("body", "semibold") : F("display", "semibold");
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
  const total = pdf.getPageCount();
  pages.forEach((pg, i) => text(pg, 105, 290, `${i + 1} / ${total}`, F("body", "regular"), 8, hex(pal.muted), { align: "center" }));
  return pdf.save();
}
