// Client-side, agency-grade PDF rendering with pdf-lib. Runs entirely in the
// browser — logo bytes never leave the machine. Each studio profile gets a
// distinct cover treatment, personalised cover ("Prepared for …"), running
// footers and a closing page, so the deliverable feels designed, not generated.

import { describeQuery, titleCase, typeLabel } from "./curate.js";
import { preview, previewPNG } from "./images.js";

const { PDFDocument, rgb, degrees } = window.PDFLib;

const MM = 72 / 25.4;
// PASS 8: Ditto Sunlit Wildflower Landscape
const PAGE_W = 297 * MM;
const PAGE_H = 210 * MM;

// The Ditto Palette Hardcoded for PDF Engine
const P = {
  canvas: "#f9fbf2",
  ink: "#130e30",
  yellow: "#ffe228",
  slate: "#5f5c6e",
  softMeadow: "#eff2e5",
  pastels: ["#eff2e5", "#fbcfe8", "#e6dafd", "#b6edee", "#afe4ff"]
};

// ---- font registry ---------------------------------------------------------
const FONT_FILES = {
  DMSerifDisplay: { regular: "DMSerifDisplay-Regular.ttf", semibold: "DMSerifDisplay-Regular.ttf", bold: "DMSerifDisplay-Regular.ttf" },
  Inter: { regular: "Inter-Regular.ttf", semibold: "Inter-SemiBold.ttf", bold: "Inter-Bold.ttf" },
  JetBrainsMono:{ regular: "JetBrainsMono-Regular.ttf", semibold: "JetBrainsMono-Medium.ttf", bold: "JetBrainsMono-Medium.ttf" },
};
const _buf = new Map();
async function buf(file) {
  if (!_buf.has(file)) _buf.set(file, await fetch(`fonts/${file}`).then((r) => r.arrayBuffer()));
  return _buf.get(file);
}
async function makeFonts(pdf) {
  pdf.registerFontkit(window.fontkit);
  const emb = {};
  for (const fam of ["DMSerifDisplay", "Inter", "JetBrainsMono"]) {
    const f = FONT_FILES[fam];
    try {
      const [rb, sb, bb] = await Promise.all([buf(f.regular), buf(f.semibold), buf(f.bold)]);
      emb[fam] = {
        regular: await pdf.embedFont(rb, { subset: true }),
        semibold: await pdf.embedFont(sb, { subset: true }),
        bold: await pdf.embedFont(bb, { subset: true })
      };
    } catch(e) { console.error("Missing font file for", fam); }
  }
  return (role, weight = "regular") => {
    const fam = role === "display" ? "DMSerifDisplay" : (role === "mono" ? "JetBrainsMono" : "Inter");
    return emb[fam][weight] || emb.Inter.regular;
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
const displayTrack = (size) => -(size * 0.01); // Ditto tight tracking

function microLabel(page, x, y, s, F, size, color, { align = "left", track = size * 0.6, rotate = 0 } = {}) {
  text(page, x, y, caps(s), F("mono", "semibold"), size, color, { align, tracking: track, rotate });
}
function folio(page, x, y, no, total, F, color, align = "right") {
  text(page, x, y, `${String(no).padStart(2, "0")} / ${String(total).padStart(2, "0")}`,
    F("mono", "regular"), 7, color, { align, tracking: 1.5 });
}
const indLabel = (e) => (e.industries || []).slice(0, 3).map((i) => i.replace(/-/g, " ")).join("  ·  ");

// ---- architectural tile logic ---------------------------------------------
function drawTile(page, x, y, w, h, img, entry, F, idx, numberLabel) {
  // Cycle through the Aboard/Ditto pastels for the grid surface
  const bgFill = hex(P.pastels[idx % P.pastels.length]);
  rect(page, x, y, w, h, { fill: bgFill, stroke: hex(P.ink), line: 0.25 });
  
  const pad = w * 0.15;
  const f = fit(img, w, h, pad);
  page.drawImage(img, { x: (x + w / 2) * MM - (f.w * MM) / 2, y: yT(y + h / 2) - (f.h * MM) / 2, width: f.w * MM, height: f.h * MM });
  
  const nFont = F("body", "bold"); 
  const ty = y + h + 6;
  
  let tx = x;
  if (numberLabel !== null) {
    text(page, tx, ty, String(numberLabel).padStart(2, "0"), F("mono", "semibold"), 7, hex(P.ink), { tracking: 0.5 });
    tx += 8;
  }
  
  text(page, tx, ty, clip(entry.name, nFont, 10, w - (tx - x)), nFont, 10, hex(P.ink), { tracking: displayTrack(10) });
  
  const meta = [typeLabel(entry.types), indLabel(entry)].filter(Boolean).join("    —    ");
  if (meta) {
    microLabel(page, tx, ty + 5, meta, F, 5.5, hex(P.slate), { track: 1.5 });
  }
}

async function embedPreviews(pdf, src, profile, entries) {
  const prepared = await Promise.all(entries.map(async (e) => {
    const blob = await src.getBlob(profile, `logos/${e.file}`);
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


// ---- covers (Sunlit Wildflower) --------------------------------
function drawCover(page, theme, F, ctx) {
  rect(page, 0, 0, 297, 210, { fill: hex(P.canvas) });
  
  const fg = hex(P.ink), accent = hex(P.yellow);
  const kicker = theme.labels.slice_kicker || "Selected work";
  const title = theme.name;
  const sub = ctx.subtitle;

  if (ctx.mark) {
    drawMark(page, ctx.mark, 24, 24, 12, "left");
  }

  rect(page, 24, 80, 6, 6, { fill: accent });
  microLabel(page, 24 + 12, 84, kicker, F, 8, fg, { track: 3 });

  // Use DM Serif Display for huge, beautiful headings
  const dFont = F("display", "regular");
  const lines = wrapText(title, dFont, 56, 200);
  let ty = 105;
  for (const line of lines) {
    text(page, 24, ty, line, dFont, 56, fg, { tracking: displayTrack(56) });
    ty += 52;
  }
  
  text(page, 24, ty - 20, sub, F("body", "regular"), 16, hex(P.slate), { tracking: -0.16 });
  
  if (ctx.clientName) {
    microLabel(page, 297 - 24, 165, "Prepared for", F, 7, fg, { align: "right", track: 2 });
    text(page, 297 - 24, 173, ctx.clientName, F("body", "semibold"), 14, fg, { align: "right", tracking: -0.14 });
    if (ctx.dateStr) microLabel(page, 297 - 24, 182, ctx.dateStr, F, 7, hex(P.slate), { align: "right", track: 1.5 });
  }

  microLabel(page, 297 - 24, 24, `${ctx.n} selected`, F, 7, hex(P.slate), { align: "right", track: 2.5 });
}


function runFooter(page, theme, F, pageNo, total, subtitle) {
  hline(page, 24, 297 - 24, 195, mix(P.ink, 0.1), 0.25);
  text(page, 24, 201, theme.name, F("body", "semibold"), 8, hex(P.ink), { tracking: 0.5 });
  microLabel(page, 297 / 2, 201, subtitle, F, 6, hex(P.slate), { align: "center", track: 2.5 });
  folio(page, 297 - 24, 201, pageNo, total, F, hex(P.ink));
}

function drawClosing(page, theme, F, ctx) {
  rect(page, 0, 0, 297, 210, { fill: hex(P.canvas) });
  const fg = hex(P.ink), accent = hex(P.yellow);
  
  rect(page, 297 / 2 - 3, 100 - 6, 6, 6, { fill: accent });
  microLabel(page, 297 / 2, 110, "End of Document", F, 8, fg, { align: "center", track: 3 });
  text(page, 297 / 2, 126, theme.name, F("display", "regular"), 32, fg, { align: "center", tracking: displayTrack(32) });
}


// ---- intelligent layout renderers -----------------------------------------

function renderBentoPage(page, theme, F, bTiles, startNo) {
  const top = 22, gap = 12, bw = 118.5, sw = 53.25, bh = 76, sh = 46;
  const coords = [
    { x: 24, y: top, w: bw, h: bh }, // L-Top (Wide)
    { x: 24, y: top + bh + 16 + gap, w: sw, h: sh }, // L-Bot1 (Sq)
    { x: 24 + sw + gap, y: top + bh + 16 + gap, w: sw, h: sh }, // L-Bot2 (Sq)
    { x: 24 + bw + gap, y: top, w: sw, h: sh }, // R-Top1 (Sq)
    { x: 24 + bw + gap + sw + gap, y: top, w: sw, h: sh }, // R-Top2 (Sq)
    { x: 24 + bw + gap, y: top + sh + 16 + gap, w: bw, h: bh } // R-Bot (Wide)
  ];
  bTiles.forEach((t, i) => {
    if (i < 6) drawTile(page, coords[i].x, coords[i].y, coords[i].w, coords[i].h, t.img, t.entry, F, i, startNo + i + 1);
  });
}

function renderShowcasePage(page, theme, F, bTiles, startNo) {
  const cols = 3, top = 24, gm = 24, gapX = 12, gapY = 24;
  const tileW = 75, tileH = 55, capH = 16;
  bTiles.forEach((t, i) => {
    if (i < 6) {
      const r = Math.floor(i / cols), c = i % cols;
      const x = gm + c * (tileW + gapX);
      const y = top + r * (tileH + capH + gapY);
      drawTile(page, x, y, tileW, tileH, t.img, t.entry, F, i, startNo + i + 1);
    }
  });
}

function renderLookbookPage(page, theme, F, bTiles, startNo) {
  const top = 32, gm = 24, gap = 12;
  const bw = 118.5, bh = 118.5; // Massive left block
  const capH = 16;
  const sh = (bh - capH - gap) / 2; // ~45.25
  const sw = bw; // full width column

  const coords = [
    { x: gm, y: top, w: bw, h: bh },
    { x: gm + bw + gap, y: top, w: sw, h: sh },
    { x: gm + bw + gap, y: top + sh + capH + gap, w: sw, h: sh }
  ];
  bTiles.forEach((t, i) => {
    if (i < 3) drawTile(page, coords[i].x, coords[i].y, coords[i].w, coords[i].h, t.img, t.entry, F, i, startNo + i + 1);
  });
}

function renderHeroPage(page, theme, F, bTiles, startNo) {
  const w = 180, h = 120, cx = 297 / 2, cy = 190 / 2; 
  if (bTiles[0]) {
    drawTile(page, cx - w/2, cy - h/2, w, h, bTiles[0].img, bTiles[0].entry, F, 0, startNo + 1);
  }
}

// Replaces the "dumb" layout engine by sorting and routing batches of logos
// to the perfect layout based on their physical aspect ratios.
function drawSmartContent(pdf, theme, F, tiles) {
  const pages = [];
  let startNo = 0;
  
  // Categorize based on intrinsic aspect ratio (Width / Height)
  let wList = tiles.filter(t => (t.img.width / t.img.height) >= 1.25);
  let sList = tiles.filter(t => (t.img.width / t.img.height) < 1.25);

  while (wList.length > 0 || sList.length > 0) {
    // Fill the background of the PDF page with Canvas color
    if (wList.length >= 2 && sList.length >= 4) {
       const p = pdf.addPage([PAGE_W, PAGE_H]); p._F = F; pages.push(p);
       rect(p, 0, 0, 297, 210, { fill: hex(P.canvas) });
       const bTiles = [wList.shift(), sList.shift(), sList.shift(), sList.shift(), sList.shift(), wList.shift()];
       renderBentoPage(p, theme, F, bTiles, startNo);
       startNo += 6;
    } else if (wList.length >= 1 && sList.length >= 2) {
       const p = pdf.addPage([PAGE_W, PAGE_H]); p._F = F; pages.push(p);
       rect(p, 0, 0, 297, 210, { fill: hex(P.canvas) });
       const bTiles = [wList.shift(), sList.shift(), sList.shift()];
       renderLookbookPage(p, theme, F, bTiles, startNo);
       startNo += 3;
    } else if (sList.length >= 6) {
       const p = pdf.addPage([PAGE_W, PAGE_H]); p._F = F; pages.push(p);
       rect(p, 0, 0, 297, 210, { fill: hex(P.canvas) });
       const bTiles = sList.splice(0, 6);
       renderShowcasePage(p, theme, F, bTiles, startNo);
       startNo += 6;
    } else if (wList.length >= 6) {
       const p = pdf.addPage([PAGE_W, PAGE_H]); p._F = F; pages.push(p);
       rect(p, 0, 0, 297, 210, { fill: hex(P.canvas) });
       const bTiles = wList.splice(0, 6);
       renderShowcasePage(p, theme, F, bTiles, startNo);
       startNo += 6;
    } else if (wList.length + sList.length <= 2) {
       const p = pdf.addPage([PAGE_W, PAGE_H]); p._F = F; pages.push(p);
       rect(p, 0, 0, 297, 210, { fill: hex(P.canvas) });
       const bTiles = [];
       if (wList.length > 0) bTiles.push(wList.shift());
       else if (sList.length > 0) bTiles.push(sList.shift());
       renderHeroPage(p, theme, F, bTiles, startNo);
       startNo += 1;
    } else {
       const p = pdf.addPage([PAGE_W, PAGE_H]); p._F = F; pages.push(p);
       rect(p, 0, 0, 297, 210, { fill: hex(P.canvas) });
       const bTiles = [];
       while (bTiles.length < 6 && (wList.length > 0 || sList.length > 0)) {
         if (wList.length > 0) bTiles.push(wList.shift());
         else bTiles.push(sList.shift());
       }
       renderShowcasePage(p, theme, F, bTiles, startNo);
       startNo += bTiles.length;
    }
  }
  return pages;
}

export async function renderSlice(src, profile, theme, entries, query, opts = {}) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${theme.name} — Logo slice`);
  pdf.setCreator("Logo Showcase · HaseebMadeIt");
  const T = theme;
  const F = await makeFonts(pdf);
  const tiles = await embedPreviews(pdf, src, profile, entries);
  const subtitle = opts.subtitle || titleCase(describeQuery(query.industries, query.types, query.matchAll));
  const ctx = { subtitle, n: entries.length, clientName: opts.clientName || "", dateStr: opts.dateStr || "" };
  const includeCover = opts.includeCover !== false;
  const includeClosing = opts.includeClosing !== false;

  ctx.mark = await loadBrandmark(pdf, T);
  if (includeCover) drawCover(pdf.addPage([PAGE_W, PAGE_H]), T, F, ctx);
  
  const contentPages = drawSmartContent(pdf, T, F, tiles);
  
  if (includeClosing) drawClosing(pdf.addPage([PAGE_W, PAGE_H]), T, F, ctx);

  const total = pdf.getPageCount();
  const startNo = includeCover ? 2 : 1;
  contentPages.forEach((pg, i) => runFooter(pg, T, F, startNo + i, total, subtitle));
  return pdf.save();
}

// ---- range (Unchanged mathematically, just landscape) -----------------------
export async function renderRange(src, profile, theme, entries, query, opts = {}) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${theme.name} — range`);
  pdf.setCreator("Logo Showcase · HaseebMadeIt");
  const T = theme;
  const F = await makeFonts(pdf);
  const tiles = await embedPreviews(pdf, src, profile, entries);
  const subtitle = opts.subtitle || titleCase(describeQuery(query.industries, query.types, query.matchAll));
  const ctx = { subtitle, n: entries.length, clientName: opts.clientName || "", dateStr: opts.dateStr || "" };

  ctx.mark = await loadBrandmark(pdf, T);
  if (opts.includeCover !== false) drawCover(pdf.addPage([PAGE_W, PAGE_H]), T, F, ctx);

  const cols = 5; // Landscape implies more cols
  const gm = 24, gap = 8, contentW = 297 - 2 * gm;
  const tileW = (contentW - gap * (cols - 1)) / cols;
  const imgH = tileW, capH = 12, tileH = imgH + capH, rowGap = 12;
  
  const pages = [];
  let page = pdf.addPage([PAGE_W, PAGE_H]); page._F = F; pages.push(page);
  rect(page, 0, 0, 297, 210, { fill: hex(P.canvas) });
  
  let top = 24, col = 0, rowY = top;
  for (let i = 0; i < tiles.length; i++) {
    const { entry, img } = tiles[i];
    if (rowY + tileH > 180) { 
      page = pdf.addPage([PAGE_W, PAGE_H]); page._F = F; pages.push(page);
      rect(page, 0, 0, 297, 210, { fill: hex(P.canvas) });
      top = 24; rowY = top; col = 0; 
    }
    const x = gm + col * (tileW + gap);
    
    drawTile(page, x, rowY, tileW, imgH, img, entry, F, i, null);
    
    if (++col >= cols) { col = 0; rowY += tileH + rowGap; }
  }
  if (opts.includeClosing !== false) drawClosing(pdf.addPage([PAGE_W, PAGE_H]), T, F, ctx);

  const total = pdf.getPageCount();
  const startNo = opts.includeCover !== false ? 2 : 1;
  pages.forEach((pg, i) => runFooter(pg, T, F, startNo + i, total, subtitle));
  return pdf.save();
}

// ---- by-type (Landscape adapted) -------------------------------------------
export async function renderByType(src, profile, theme, groups, opts = {}) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${theme.name} — by type`);
  pdf.setCreator("Logo Showcase · HaseebMadeIt");
  const T = theme;
  const F = await makeFonts(pdf);
  const all = groups.flatMap((g) => g.entries);
  const prepared = await embedPreviews(pdf, src, profile, all);
  const imgOf = new Map(prepared.map((p) => [p.entry.file, p.img]));
  const ctx = { subtitle: opts.subtitle || "By logo type", n: all.length, clientName: "", dateStr: opts.dateStr || "" };
  ctx.mark = await loadBrandmark(pdf, T);
  
  if (opts.includeCover !== false) drawCover(pdf.addPage([PAGE_W, PAGE_H]), T, F, ctx);

  const cols = 4, gm = 24, gap = 12, secGap = 24;
  const contentW = 297 - 2 * gm;
  const tileW = (contentW - gap * (cols - 1)) / cols;
  const imgH = tileW * 0.8, capH = 12, tileH = imgH + capH, rowGap = 12;
  
  const pages = [];
  let page = null, y = 0;
  const newPage = () => {
    page = pdf.addPage([PAGE_W, PAGE_H]); page._F = F; pages.push(page);
    rect(page, 0, 0, 297, 210, { fill: hex(P.canvas) });
    y = 24;
  };
  newPage();
  
  for (const g of groups) {
    if (y + 36 > 180) newPage();
    const shown = g.entries.length, total = g.total ?? shown;
    microLabel(page, gm, y + 4, g.type.replace(/-/g, " "), F, 8.5, hex(P.ink), { track: 2.5 });
    text(page, 297 - gm, y + 4, total === shown ? `${total} mark${total !== 1 ? "s" : ""}` : `${shown} of ${total}`,
         F("mono", "semibold"), 7, hex(P.slate), { align: "right" });
    hline(page, gm, 297 - gm, y + 8, mix(P.ink, 0.2), 0.5);
    y += 16;
    let col = 0;
    for (let i=0; i<g.entries.length; i++) {
      const e = g.entries[i];
      if (y + tileH > 180) { newPage(); col = 0; }
      const x = gm + col * (tileW + gap);
      const img = imgOf.get(e.file);
      if (img) {
        drawTile(page, x, y, tileW, imgH, img, e, F, i, null);
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
