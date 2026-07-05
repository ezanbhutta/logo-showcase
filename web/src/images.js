// Make a screen-res preview from a master logo, in the browser.
// Handles raster (png/jpg/webp/gif), vector SVG, and single-page PDF logos —
// each is rasterised to a flattened JPEG so pdf-lib can embed it. Downscales
// and flattens transparency onto the tile background. Cached per (file, bg).

const cache = new Map();

// ---- lazy pdf.js (only loaded the first time a PDF logo is seen) -----------
let _pdfjs = null;
function loadPdfjs() {
  if (!_pdfjs) {
    _pdfjs = import("../lib/pdf.min.js").then((m) => {
      m.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';
      return m;
    });
  }
  return _pdfjs;
}

// Render page 1 of a PDF logo to a canvas at print resolution.
async function renderPdf(blob, maxEdge) {
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(await blob.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  try {
    const pageObj = await doc.getPage(1);
    const base = pageObj.getViewport({ scale: 1 });
    const scale = Math.min(4, Math.max(1.5, (maxEdge * 1.5) / Math.max(base.width, base.height)));
    const vp = pageObj.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(vp.width);
    canvas.height = Math.ceil(vp.height);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await pageObj.render({ canvasContext: ctx, viewport: vp }).promise;
    return { source: canvas, width: canvas.width, height: canvas.height };
  } finally { doc.destroy?.(); }
}

// Render an SVG logo to a canvas, resolving its intrinsic size (or viewBox).
async function renderSvg(blob, maxEdge) {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise((res, rej) => {
      img.onload = res; img.onerror = () => rej(new Error("svg decode failed"));
      img.src = url;
    });
    let w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h) {                          // no intrinsic size → read the viewBox
      const vb = /viewBox\s*=\s*["']\s*([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)/i.exec(await blob.text());
      if (vb) { w = parseFloat(vb[3]); h = parseFloat(vb[4]); }
      if (!w || !h) { w = 512; h = 512; }
    }
    const s = Math.min(maxEdge * 2, 2400) / Math.max(w, h);   // oversample → crisp
    const rw = Math.max(1, Math.round(w * s)), rh = Math.max(1, Math.round(h * s));
    const canvas = document.createElement("canvas");
    canvas.width = rw; canvas.height = rh;
    canvas.getContext("2d").drawImage(img, 0, 0, rw, rh);
    return { source: canvas, width: rw, height: rh };
  } finally { URL.revokeObjectURL(url); }
}

async function rasterSource(blob, key, maxEdge) {
  const ext = (key.split(".").pop() || "").toLowerCase();
  if (ext === "pdf" || blob.type === "application/pdf") return renderPdf(blob, maxEdge);
  if (ext === "svg" || blob.type === "image/svg+xml") return renderSvg(blob, maxEdge);
  const bitmap = await createImageBitmap(blob);
  return { source: bitmap, width: bitmap.width, height: bitmap.height };
}

export async function preview(blob, key, bgHex = "#FFFFFF", maxEdge = 1000) {
  const cacheKey = `${key}|${bgHex}|${maxEdge}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const src = await rasterSource(blob, key, maxEdge);
  const scale = Math.min(1, maxEdge / Math.max(src.width, src.height));
  const width = Math.max(1, Math.round(src.width * scale));
  const height = Math.max(1, Math.round(src.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = bgHex;
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src.source, 0, 0, width, height);
  src.source.close?.();

  const out = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.85));
  const bytes = new Uint8Array(await out.arrayBuffer());
  const result = { bytes, width, height, format: "jpg" };
  cache.set(cacheKey, result);
  return result;
}

// Rasterise a logo to PNG bytes preserving transparency (no background fill).
// Used for studio brandmarks placed on dark/coloured PDF covers.
export async function previewPNG(blob, key, maxEdge = 700) {
  const ck = `png:${key}|${maxEdge}`;
  if (cache.has(ck)) return cache.get(ck);
  const src = await rasterSource(blob, key, maxEdge);
  const scale = Math.min(1, maxEdge / Math.max(src.width, src.height));
  const width = Math.max(1, Math.round(src.width * scale));
  const height = Math.max(1, Math.round(src.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src.source, 0, 0, width, height);
  src.source.close?.();
  const out = await new Promise((res) => canvas.toBlob(res, "image/png"));
  const bytes = new Uint8Array(await out.arrayBuffer());
  const result = { bytes, width, height, format: "png" };
  cache.set(ck, result);
  return result;
}

// A small object URL for on-screen thumbnails. Raster/SVG can be shown directly
// in an <img>; PDFs are rasterised first.
export async function thumbUrl(blob, name = "") {
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (ext === "pdf" || blob.type === "application/pdf") {
    const pv = await preview(blob, `thumb/${name}`, "#FFFFFF", 480);
    return URL.createObjectURL(new Blob([pv.bytes], { type: "image/jpeg" }));
  }
  return URL.createObjectURL(blob);
}
