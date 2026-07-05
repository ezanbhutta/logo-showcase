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
import { parseCSV } from "./csv.js";

const norm = (v) => v.trim().toLowerCase().replace(/\s+/g, "-");
// Slug for industry / type tokens parsed from filenames (punctuation-safe).
const slug = (v) => String(v).trim().toLowerCase().replace(/&/g, " and ")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const uniq = (a) => [...new Set(a.filter(Boolean))];

// Map a free-text logo-type descriptor to a controlled type slug (see vocab.js).
const LOGO_TYPE_MAP = {
  logotype: "wordmark", wordmark: "wordmark", "word-mark": "wordmark", text: "wordmark",
  lettermark: "lettermark", "letter-mark": "lettermark", monogram: "lettermark", initial: "lettermark", initials: "lettermark",
  pictorial: "pictorial", "pictorial-mark": "pictorial", brandmark: "pictorial", "brand-mark": "pictorial",
  logomark: "pictorial", "logo-mark": "pictorial", symbol: "pictorial", icon: "pictorial", "icon-mark": "pictorial",
  abstract: "abstract", "abstract-mark": "abstract",
  mascot: "mascot", character: "mascot",
  combination: "combination", "combination-mark": "combination", combo: "combination", combined: "combination",
  emblem: "emblem", badge: "emblem", crest: "emblem", seal: "emblem",
};
const mapLogoType = (d) => { const s = slug(d); return LOGO_TYPE_MAP[s] || s; };
const isLogoDesc = (d) => { const s = slug(d); return s in LOGO_TYPE_MAP || /(^|-)(mark|type)$/.test(s); };
const isGuideDesc = (d) => /guide|guideline|brand-?book|style/.test(slug(d));

// Filenames follow:  Brand-Industry-Descriptor (logos / guidelines) or
//                    Brand-Industry           (social / stationery / animation).
// Industry and descriptor are optional; brand is always the first segment.
function parseName(name, typeKey) {
  const parts = name.split(/\s*-\s*/).map((s) => s.trim()).filter(Boolean);
  const out = { brand: parts[0] || name, industry: "", descriptor: "" };
  if (parts.length < 2) return out;
  const hasDesc = typeKey === "logos" || typeKey === "guidelines";
  if (hasDesc) {
    if (parts.length >= 3) { out.industry = parts[1]; out.descriptor = parts.slice(2).join(" "); }
    else {                                   // 2 parts → industry OR descriptor
      const p = parts[1];
      if ((typeKey === "logos" && isLogoDesc(p)) || (typeKey === "guidelines" && isGuideDesc(p))) out.descriptor = p;
      else out.industry = p;
    }
  } else {
    out.industry = parts.slice(1).join(" ");
  }
  return out;
}
// Parse an optional tags.csv (columns: brand|file, industries, types) into a
// Map keyed by lowercased brand → { industries[], types[] }.
function parseTags(text) {
  const map = new Map();
  if (!text) return map;
  const { records } = parseCSV(text);
  for (const r of records) {
    const key = (r.brand || r.name || (r.file || "").replace(/\.[^.]+$/, "")).trim().toLowerCase();
    if (!key) continue;
    const split = (s) => (s || "").split("|").map(norm).filter(Boolean);
    map.set(key, { industries: split(r.industries), types: split(r.types) });
  }
  return map;
}

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
// Build asset records, deriving brand / industry / descriptor from the filename.
function classify(files, typeKey) {
  return files
    .filter((f) => ALL_EXT.includes(extOf(f)))
    .map((f) => {
      const base = f.replace(/\.[^.]+$/, "").trim();
      const p = parseName(base, typeKey);
      return {
        brand: p.brand, file: f, ext: extOf(f), kind: kindOf(extOf(f)),
        _industry: p.industry ? slug(p.industry) : "", _descriptor: p.descriptor,
      };
    })
    .sort((a, b) => a.brand.localeCompare(b.brand));
}

// Merge filename-derived industry/type with any tags.csv entry for the brand.
function attachMeta(list, typeKey, tags) {
  for (const a of list) {
    const t = (tags && tags.get(a.brand.toLowerCase())) || {};
    a.industries = uniq([...(a._industry ? [a._industry] : []), ...(t.industries || [])]);
    if (typeKey === "logos")
      a.types = uniq([...(a._descriptor ? [mapLogoType(a._descriptor)] : []), ...(t.types || [])]);
    a.industryLabel = a._industry ? a._industry.replace(/-/g, " ") : "";
    a.descriptor = a._descriptor || "";
    delete a._industry; delete a._descriptor;
  }
  return list;
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
  async _tags() {
    if (this._tagMap) return this._tagMap;
    let text = null;
    try { text = await (await (await this.root.getFileHandle("tags.csv")).getFile()).text(); } catch {}
    if (!text) { try { const d = await this._typeDirs(); if (d.logos) text = await (await (await d.logos.getFileHandle("tags.csv")).getFile()).text(); } catch {} }
    this._tagMap = parseTags(text);
    return this._tagMap;
  }
  async assets(typeKey) {
    const d = await this._typeDirs();
    if (!d[typeKey]) return [];
    const files = [];
    for await (const [fname, h] of d[typeKey].entries()) if (h.kind === "file" && fname.toLowerCase() !== "tags.csv") files.push(fname);
    const list = classify(files, typeKey);
    return attachMeta(list, typeKey, await this._tags());
  }
  async hasTags() { return (await this._tags()).size > 0; }
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
    if (!this._m) {
      try {
        const res = await fetch(`${this.base}/manifest.json`);
        this._m = await res.json();
      } catch (e) {
        console.warn("Demo portfolio not available on file:// protocol:", e);
        this._m = { profile: "eikon", name: "Local Mode", dirs: {}, types: {}, tags: {} };
      }
    }
    return this._m;
  }
  profile() {
    const id = this._m?.profile || "eikon";
    return { id, theme: THEMES[id] || detectProfile(id).theme };
  }
  async types() { const m = await this._manifest(); return TYPES.filter((t) => (m.types[t.key] || []).length); }
  async assets(typeKey) {
    const m = await this._manifest();
    const list = classify(m.types[typeKey] || [], typeKey);
    const tags = new Map(Object.entries(m.tags || {}).map(([k, v]) => [k.toLowerCase(),
      { industries: (v.industries || []).map(norm), types: (v.types || []).map(norm) }]));
    return attachMeta(list, typeKey, tags);
  }
  async hasTags() { const m = await this._manifest(); return !!m.tags; }
  async getBlob(typeKey, file) {
    const m = await this._manifest();
    const folder = (m.dirs && m.dirs[typeKey]) || TYPES.find((x) => x.key === typeKey).label;
    const res = await fetch(`${this.base}/${encodeURIComponent(folder)}/${encodeURIComponent(file)}`);
    if (!res.ok) throw new Error(`missing ${folder}/${file}`);
    return res.blob();
  }
}
