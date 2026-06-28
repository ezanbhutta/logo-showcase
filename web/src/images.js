// Make a screen-res preview from a master image, in the browser.
// Flattens transparency onto the tile background and downscales, mirroring the
// Python image pipeline so PDFs stay small. Cached per (file, bg) in memory.

const cache = new Map();

export async function preview(blob, key, bgHex = "#FFFFFF", maxEdge = 1000) {
  const cacheKey = `${key}|${bgHex}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const bitmap = await createImageBitmap(blob);
  let { width, height } = bitmap;
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  width = Math.round(width * scale);
  height = Math.round(height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = bgHex;
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const out = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.85));
  const bytes = new Uint8Array(await out.arrayBuffer());
  const result = { bytes, width, height, format: "jpg" };
  cache.set(cacheKey, result);
  return result;
}

// A small object URL for on-screen thumbnails (gallery / cards).
export async function thumbUrl(blob) {
  return URL.createObjectURL(blob);
}
