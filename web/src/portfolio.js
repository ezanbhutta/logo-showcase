// Portfolio data model. One linked folder named "<Studio> Portfolio" holds
// deliverable-type folders; files inside are named by brand. The app detects
// the studio from the folder name (themes.js) — no dropdown, link once.
//
//   <Studio> Portfolio/
//   ├── Logos/                 Apex Builders-Logotype.png  (png/jpg/pdf)
//   ├── Brand Guidelines/      Apex Builders-Brand Guidelines.pdf
//   ├── Social Media Kit/      Apex Builders.png
//   ├── Stationery/            Apex Builders.pdf
//   └── Logo Animation/        Apex Builders.mp4 / .gif
//
// Two sources share one interface: FsPortfolio (real local folder, File System
// Access) and DemoPortfolio (bundled demo via fetch + manifest).

import { THEMES, detectProfile } from "./themes.js";

export const TYPES = [
  { key: "logos",      label: "Logos",            dirs: ["logos", "logo"],
    strip: ["logotype", "logo", "logomark", "wordmark"] },
  { key: "guidelines", label: "Brand Guidelines", dirs: ["brand guidelines", "guidelines", "brand-guidelines"],
    strip: ["brand guidelines", "guidelines", "brand guide", "guide"] },
  { key: "social",     label: "Social Media Kit", dirs: ["social media kit", "social media", "social-media-kit", "social"],
    strip: ["social media kit", "social media", "social kit", "social"] },
  { key: "stationery", label: "Stationery",       dirs: ["stationery", "stationary"],
    strip: ["stationery", "stationary"] },
  { key: "animation",  label: "Logo Animation",   dirs: ["logo animation", "logo animations", "logo-animation", "animation", "animations"],
    strip: ["logo animation", "animation"] },
];

const IMAGE_EXT = ["png", "jpg", "jpeg", "webp", "svg"];
const PDF_EXT = ["pdf"];
const VIDEO_EXT = ["mp4", "webm", "mov"];
const GIF_EXT = ["gif"];
const ALL_EXT = [...IMAGE_EXT, ...PDF_EXT, ...VIDEO_EXT, ...GIF_EXT];

const extOf = (f) => (f.split(".").pop() || "").toLowerCase();
function kindOf(ext) {
  if (PDF_EXT.includes(ext)) return "pdf";
  if (VIDEO_EXT.includes(ext)) return "video";
  return "image";              // png/jpg/webp/svg/gif render as <img>
}
function brandFrom(filename, strip) {
  let s = filename.replace(/\.[^.]+$/, "").trim();
  for (const suf of strip) {
    const re = new RegExp("[\\s_–—-]*" + suf.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*$", "i");
    s = s.replace(re, "").trim();
  }
  return s.replace(/[\s_–—-]+$/, "").trim() || filename;
}
function classify(files, typeKey) {
  const t = TYPES.find((x) => x.key === typeKey);
  return files
    .filter((f) => ALL_EXT.includes(extOf(f)))
    .map((f) => ({ brand: brandFrom(f, t.strip), file: f, ext: extOf(f), kind: kindOf(extOf(f)) }))
    .sort((a, b) => a.brand.localeCompare(b.brand));
}

// ---- File System Access portfolio -----------------------------------------

export class FsPortfolio {
  constructor(rootHandle) { this.root = rootHandle; this._dirs = null; }
  profile() { return detectProfile(this.root.name); }

  async _typeDirs() {
    if (this._dirs) return this._dirs;
    const map = {};
    for await (const [name, h] of this.root.entries()) {
      if (h.kind !== "directory") continue;
      const low = name.toLowerCase().trim();
      const t = TYPES.find((x) => x.dirs.includes(low));
      if (t && !map[t.key]) map[t.key] = h;
    }
    this._dirs = map;
    return map;
  }
  async types() { const d = await this._typeDirs(); return TYPES.filter((t) => d[t.key]); }
  async assets(typeKey) {
    const d = await this._typeDirs();
    if (!d[typeKey]) return [];
    const files = [];
    for await (const [fname, h] of d[typeKey].entries()) if (h.kind === "file") files.push(fname);
    return classify(files, typeKey);
  }
  async getBlob(typeKey, file) {
    const d = await this._typeDirs();
    const fh = await d[typeKey].getFileHandle(file);
    return fh.getFile();
  }
}

// ---- Bundled demo portfolio ------------------------------------------------

export class DemoPortfolio {
  constructor(base = "demo/portfolio") { this.base = base; this._m = null; }
  async _manifest() {
    if (!this._m) this._m = await (await fetch(`${this.base}/manifest.json`)).json();
    return this._m;
  }
  profile() {
    const id = this._m?.profile || "eikon";
    return { id, theme: THEMES[id] || detectProfile(id).theme };
  }
  async types() { const m = await this._manifest(); return TYPES.filter((t) => (m.types[t.key] || []).length); }
  async assets(typeKey) { const m = await this._manifest(); return classify(m.types[typeKey] || [], typeKey); }
  async getBlob(typeKey, file) {
    const m = await this._manifest();
    const folder = (m.dirs && m.dirs[typeKey]) || TYPES.find((x) => x.key === typeKey).label;
    const res = await fetch(`${this.base}/${encodeURIComponent(folder)}/${encodeURIComponent(file)}`);
    if (!res.ok) throw new Error(`missing ${folder}/${file}`);
    return res.blob();
  }
}
