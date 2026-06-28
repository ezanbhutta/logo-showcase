// App controller — portfolio model. One linked "<Studio> Portfolio" folder,
// studio detected from the name (no dropdown). Logos -> themed showcase with a
// live preview; Brand Guidelines / Social / Stationery / Animation -> search,
// preview, download, share.
import {
  saveHandle, loadHandle, clearHandle, verifyPermission, fsAccessSupported,
} from "./src/source.js";
import { FsPortfolio, DemoPortfolio, TYPES } from "./src/portfolio.js";
import { THEMES } from "./src/themes.js";
import { renderSlice, renderRange, renderByType } from "./src/pdf.js";
import { INDUSTRIES, TYPES as LOGO_TYPES } from "./src/vocab.js";
import { thumbUrl } from "./src/images.js";

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// Kinds that can be rasterised into the deck: raster images, vector SVG (kind
// "image"), and single-page PDF logos. Only video is left out.
const IMG_KINDS = new Set(["image", "pdf"]);

const state = {
  source: new DemoPortfolio(), isDemo: true, srcGen: 0,
  profileId: "eikon", profileName: "Eikon Design", theme: THEMES.eikon,
  types: [], pendingHandle: null,
  assetsCache: new Map(),     // typeKey -> [assets]
  blobs: new Map(),           // `${type}/${file}` -> objectURL
  logos: [], picked: [],      // showcase selection (ordered file list)
  live: { bytes: null, url: null, running: false, pending: false, wantId: 0 },
  modalUrl: null,
};
const mk = { mode: "slice", layout: "grid", columns: "", density: "", cover: true, closing: false, perType: "" };
const filters = { industry: "", type: "" };

// ====== blobs ===============================================================
async function blobUrl(typeKey, file) {
  const k = `${typeKey}/${file}`;
  if (state.blobs.has(k)) return state.blobs.get(k);
  const gen = state.srcGen;
  const url = URL.createObjectURL(await state.source.getBlob(typeKey, file));
  if (gen !== state.srcGen) { URL.revokeObjectURL(url); return url; }
  state.blobs.set(k, url); return url;
}
function clearBlobs() { state.blobs.forEach((u) => URL.revokeObjectURL(u)); state.blobs.clear(); }
function download(url, name) { const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); }

// ====== toasts ==============================================================
function toast(msg, kind = "ok") {
  const el = document.createElement("div"); el.className = `toast ${kind}`;
  el.innerHTML = `<span>${kind === "err" ? "✕" : kind === "warn" ? "!" : "✓"}</span><span>${esc(msg)}</span>`;
  $("#toasts").appendChild(el);
  const kill = () => { el.classList.add("out"); setTimeout(() => el.remove(), 220); };
  const t = setTimeout(kill, 3200);
  el.addEventListener("mouseenter", () => clearTimeout(t));
  el.addEventListener("mouseleave", () => setTimeout(kill, 1000));
}

// ====== source / detection ==================================================
async function onSourceChanged() {
  state.srcGen++; state.assetsCache.clear(); clearBlobs();
  browseInit = false; browseOpen.clear();
  // A stale filter must never hide a freshly linked folder's logos.
  filters.industry = ""; filters.type = "";
  const fi = $("#filter-industry"); if (fi) fi.value = "";
  const ft = $("#filter-type"); if (ft) ft.value = "";
  const ls = $("#logos-search"); if (ls) ls.value = "";
  const prof = state.source.profile();
  state.profileId = prof.id; state.theme = prof.theme || THEMES.eikon;
  state.profileName = state.theme.name || prof.id;
  state.types = await state.source.types();
  $("#source-text").textContent = state.isDemo ? "Demo portfolio" : state.profileName;
  $("#source-badge").classList.toggle("live", !state.isDemo);
  $("#connect-banner").hidden = !state.isDemo || !fsAccessSupported();
  $("#logos-title").textContent = `${state.profileName} — Logos`;
  renderSettings();
  buildTabs();
  // load logos for showcase
  state.logos = await state.source.assets("logos").catch(() => []);
  state.picked = [];
  renderPicker();
  buildPalette();
  scheduleRender(60);
  // default view
  switchView(currentView && viewExists(currentView) ? currentView : "logos");
}
async function useDemo() { state.source = new DemoPortfolio(); state.isDemo = true; await state.source._manifest(); await onSourceChanged(); }
async function useFolder(h) { state.source = new FsPortfolio(h); state.isDemo = false; await onSourceChanged(); }

// ====== tabs / views ========================================================
let currentView = "logos", currentType = null;
function viewExists(v) {
  if (v === "logos" || v === "settings") return true;
  if (v === "browse") return state.types.length > 0;
  if (v.startsWith("assets:")) return state.types.some((t) => t.key === v.slice(7));
  return false;
}
function buildTabs() {
  const tabs = $("#tabs"); tabs.innerHTML = "";
  const add = (label, view) => {
    const b = document.createElement("button");
    b.className = "tab"; b.dataset.view = view; b.role = "tab"; b.innerHTML = `<span>${label}</span>`;
    b.addEventListener("click", () => switchView(view));
    tabs.appendChild(b);
  };
  if (state.types.some((t) => t.key === "logos")) add("Logos", "logos");
  if (state.types.length) add("Files", "browse");
  state.types.filter((t) => t.key !== "logos").forEach((t) => add(t.label, `assets:${t.key}`));
  add("Settings", "settings");
}
function switchView(view) {
  currentView = view;
  $$(".tab").forEach((t) => { const a = t.dataset.view === view; t.classList.toggle("active", a); t.setAttribute("aria-selected", String(a)); });
  const isAssets = view.startsWith("assets:");
  $("#view-logos").hidden = view !== "logos";
  $("#view-settings").hidden = view !== "settings";
  $("#view-browse").hidden = view !== "browse";
  $("#view-assets").hidden = !isAssets;
  if (isAssets) { currentType = view.slice(7); renderAssets(currentType); }
  if (view === "browse") renderBrowse();
}

// ====== Logos showcase ======================================================
function imageLogos() {
  return state.logos.filter((a) => IMG_KINDS.has(a.kind))
    .filter((a) => !filters.industry || (a.industries || []).includes(filters.industry))
    .filter((a) => !filters.type || (a.types || []).includes(filters.type));
}
const toEntry = (a) => ({ file: a.file, name: a.brand, types: a.types || [], industries: a.industries || [], tier: 1, year: null });
function logoEntries(files) {
  const byFile = new Map(state.logos.map((a) => [a.file, a]));
  return files.map((f) => byFile.get(f)).filter(Boolean).map(toEntry);
}
function pickedOrAll() {
  if (state.picked.length) return logoEntries(state.picked);
  return imageLogos().map(toEntry);
}
async function renderPicker() {
  const box = $("#logos-picker"); const q = ($("#logos-search").value || "").toLowerCase();
  const renderable = state.logos.filter((a) => IMG_KINDS.has(a.kind));
  const matched = imageLogos();
  const imgs = matched.filter((a) => !q || a.brand.toLowerCase().includes(q));
  box.innerHTML = "";
  const empty = $("#logos-empty");
  const filterActive = !!(filters.industry || filters.type);
  if (!matched.length) {
    empty.hidden = false;
    if (!state.logos.length) empty.innerHTML = `No <code>Logos</code> folder found in this portfolio.`;
    else if (!renderable.length) empty.innerHTML = `The Logos folder has ${state.logos.length} file(s) but none can be rendered — use PNG, JPG, SVG or PDF.`;
    else if (filterActive) empty.innerHTML = `None of the ${renderable.length} logos match this filter. <button class="link" id="logos-clearfilter">Clear filters</button>`;
    else empty.innerHTML = `No logos to show.`;
    const cf = $("#logos-clearfilter");
    if (cf) cf.addEventListener("click", () => { filters.industry = ""; filters.type = ""; $("#filter-industry").value = ""; $("#filter-type").value = ""; renderPicker(); scheduleRender(120); });
  } else { empty.hidden = true; }
  for (const a of imgs) {
    const order = state.picked.indexOf(a.file);
    const el = document.createElement("div");
    el.className = "pcard" + (order >= 0 ? " sel" : "");
    el.innerHTML = `<div class="pthumb"><img alt="${esc(a.brand)}">${order >= 0 ? `<span class="pnum">${order + 1}</span>` : ""}</div><div class="pname">${esc(a.brand)}</div>`;
    const im = el.querySelector("img");
    logoThumbUrl(a).then((u) => { if (im) im.src = u; }).catch(() => {});
    el.addEventListener("click", () => { togglePick(a.file); });
    box.appendChild(el);
  }
  const n = state.picked.length;
  const other = state.logos.length - renderable.length;
  $("#logos-pickcount").textContent = (n ? `${n} selected` : `${matched.length} logos`) + (other ? ` · ${other} not embeddable` : "");
}
// Thumbnail URL for a logo — PDFs are rasterised, everything else shown directly.
async function logoThumbUrl(a) {
  if (a.kind === "pdf") return thumbUrl(await state.source.getBlob("logos", a.file), a.file);
  return blobUrl("logos", a.file);
}
function togglePick(file) {
  const i = state.picked.indexOf(file);
  if (i >= 0) state.picked.splice(i, 1); else state.picked.push(file);
  renderPicker(); scheduleRender(120);
}

const logoSrcAdapter = { getBlob: (_p, path) => state.source.getBlob("logos", path.replace(/^logos\//, "")) };

function setPreviewStatus(busy) {
  const s = $("#preview-status"); s.classList.toggle("busy", busy);
  $("#preview-status-text").textContent = busy ? "Updating…" : "Up to date";
  $("#preview-shell").classList.toggle("updating", busy);
}
let renderTimer = null;
function scheduleRender(delay = 350) { state.live.wantId++; setPreviewStatus(true); clearTimeout(renderTimer); renderTimer = setTimeout(runRender, delay); }
function subtitleFor() {
  if (filters.industry && filters.type) return `${titleWord(filters.industry)} · ${titleWord(filters.type)}`;
  if (filters.industry) return titleWord(filters.industry);
  if (filters.type) return titleWord(filters.type);
  return mk.mode === "bytype" ? "By logo type" : "Logo collection";
}
const titleWord = (s) => s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

async function buildCurrent() {
  const entries = pickedOrAll();
  if (!entries.length) throw new Error("No PNG/JPG logos match");
  const q = { industries: [], types: [], matchAll: false };
  const opts = { layout: mk.layout, columns: mk.columns ? parseInt(mk.columns, 10) : null,
    density: mk.density || null, includeCover: mk.cover, includeClosing: mk.closing,
    subtitle: subtitleFor(), dateStr: "" };
  if (mk.mode === "bytype") {
    const byType = new Map();
    for (const e of entries) { const t = (e.types && e.types[0]) || "untyped"; if (!byType.has(t)) byType.set(t, []); byType.get(t).push(e); }
    const cap = mk.perType ? parseInt(mk.perType, 10) : 0;
    const groups = [...byType.entries()]
      .sort((a, b) => (LOGO_TYPES.indexOf(a[0]) + 99) % 100 - (LOGO_TYPES.indexOf(b[0]) + 99) % 100)
      .map(([type, es]) => ({ type, total: es.length, entries: cap ? es.slice(0, cap) : es }));
    const bytes = await renderByType(logoSrcAdapter, state.profileId, state.theme, groups, opts);
    return { bytes, n: entries.length };
  }
  const bytes = mk.mode === "slice"
    ? await renderSlice(logoSrcAdapter, state.profileId, state.theme, entries, q, opts)
    : await renderRange(logoSrcAdapter, state.profileId, state.theme, entries, q, opts);
  return { bytes, n: entries.length };
}
async function runRender() {
  if (state.live.running) { state.live.pending = true; return; }
  state.live.running = true; const myId = state.live.wantId;
  setPreviewStatus(true); $("#preview-status").classList.remove("err");
  try {
    const r = await buildCurrent();
    if (myId !== state.live.wantId) return;
    if (state.live.url) URL.revokeObjectURL(state.live.url);
    state.live.bytes = r.bytes;
    state.live.url = URL.createObjectURL(new Blob([r.bytes], { type: "application/pdf" }));
    const frame = $("#live-frame"); frame.onload = null;
    frame.onload = () => { $("#preview-skeleton").hidden = true; frame.hidden = false; setPreviewStatus(false); };
    frame.src = state.live.url + "#toolbar=0&navpanes=0&view=FitH";
    $("#preview-skeleton").hidden = true; frame.hidden = false;
  } catch (e) {
    if (myId === state.live.wantId) { setPreviewStatus(false); $("#preview-status-text").textContent = e.message; $("#preview-status").classList.add("err"); }
  } finally {
    state.live.running = false;
    if (state.live.pending || myId !== state.live.wantId) { state.live.pending = false; runRender(); }
    else if (!$("#preview-status").classList.contains("err")) setPreviewStatus(false);
  }
}
function setBusy(btn, busy) { if (!btn) return; btn.disabled = busy; const sp = btn.querySelector(".cta-spin"); if (sp) sp.hidden = !busy; }
function whenIdle(timeout = 6000) {
  return new Promise((res) => { const s = Date.now(); const t = setInterval(() => { if ((!state.live.running && !state.live.pending) || Date.now() - s > timeout) { clearInterval(t); res(); } }, 70); });
}
function deckFilename() {
  const p = [state.profileId];
  if (mk.mode === "bytype") p.push("by-type");
  else if (filters.industry || filters.type) { if (filters.industry) p.push(filters.industry); if (filters.type) p.push(filters.type); }
  else p.push(mk.mode === "range" ? "all" : "selected");
  return p.join("-") + ".pdf";
}
async function downloadLive() {
  const btn = $("#preview-download2");
  if (state.live.running || state.live.pending || !state.live.bytes) { setBusy(btn, true); if (!state.live.bytes && !state.live.running) scheduleRender(0); await whenIdle(); setBusy(btn, false); }
  if (!state.live.bytes) { toast("Nothing to download yet", "warn"); return; }
  download(state.live.url, deckFilename());
  btn.classList.add("success"); const lab = btn.querySelector(".cta-label"); const old = lab.textContent; lab.textContent = "✓ Saved";
  setTimeout(() => { btn.classList.remove("success"); lab.textContent = old; }, 1400);
  toast("PDF downloaded");
}

// ====== Asset views =========================================================
async function renderAssets(typeKey) {
  const t = TYPES.find((x) => x.key === typeKey);
  $("#assets-title").textContent = `${state.profileName} — ${t.label}`;
  $("#assets-lede").textContent = "Search a brand, preview, then download to share with the client.";
  const grid = $("#assets-grid"); grid.innerHTML = "<div class='muted' style='padding:1rem'>Loading…</div>";
  let assets = state.assetsCache.get(typeKey);
  if (!assets) { assets = await state.source.assets(typeKey).catch(() => []); state.assetsCache.set(typeKey, assets); }
  const q = ($("#assets-search").value || "").toLowerCase();
  const visible = assets.filter((a) => !q || a.brand.toLowerCase().includes(q));
  grid.innerHTML = "";
  $("#assets-empty").hidden = visible.length !== 0;
  $("#assets-empty-t").textContent = assets.length ? "No brands match your search" : `No ${t.label} in this portfolio yet`;
  for (const a of visible) grid.appendChild(assetCard(typeKey, a));
}
// One deliverable tile — thumbnail (raster/SVG inline, PDF rasterised) + caption.
function assetCard(typeKey, a) {
  const card = document.createElement("div"); card.className = "acard";
  const badge = a.kind === "pdf" ? "PDF" : a.kind === "video" ? "VIDEO" : a.ext.toUpperCase();
  const sub = a.industryLabel ? esc(a.industryLabel) : (a.descriptor ? esc(a.descriptor) : "");
  card.innerHTML = `<div class="athumb ${a.kind}"><span class="abadge">${esc(badge)}</span></div>
    <div class="acap"><span class="anm">${esc(a.brand)}</span>
      <span class="acap-row"><span class="asub">${sub}</span><span class="aview">View ›</span></span></div>`;
  const thumb = card.querySelector(".athumb");
  if (a.kind === "image" || a.kind === "pdf") {
    const im = document.createElement("img");
    const p = a.kind === "pdf"
      ? state.source.getBlob(typeKey, a.file).then((b) => thumbUrl(b, a.file))
      : blobUrl(typeKey, a.file);
    Promise.resolve(p).then((u) => { im.src = u; }).catch(() => {});
    thumb.appendChild(im);
  }
  card.addEventListener("click", () => openAsset(typeKey, a));
  return card;
}
// ====== Files tree (folder/subfolder browse) ================================
const browseOpen = new Set();
let browseInit = false;
async function loadAssets(typeKey) {
  let a = state.assetsCache.get(typeKey);
  if (!a) { a = await state.source.assets(typeKey).catch(() => []); state.assetsCache.set(typeKey, a); }
  return a;
}
async function renderBrowse() {
  const tree = $("#browse-tree");
  const q = ($("#browse-search").value || "").trim().toLowerCase();
  tree.innerHTML = "<div class='muted' style='padding:1rem'>Loading…</div>";
  const data = [];
  for (const t of state.types) {
    const assets = await loadAssets(t.key);
    const visible = assets.filter((a) => !q || a.brand.toLowerCase().includes(q) || a.file.toLowerCase().includes(q)
      || (a.industryLabel || "").toLowerCase().includes(q));
    data.push({ t, total: assets.length, visible });
  }
  tree.innerHTML = "";
  const totalFiles = data.reduce((n, d) => n + d.total, 0);
  const matchFiles = data.reduce((n, d) => n + d.visible.length, 0);
  const emptyT = $("#browse-empty-t");
  $("#browse-empty").hidden = !(totalFiles === 0 || matchFiles === 0);
  if (totalFiles === 0) { emptyT.textContent = "No files in this portfolio yet"; return; }
  if (matchFiles === 0) { emptyT.textContent = "No files match your search"; return; }
  for (const { t, total, visible } of data) {
    if (q && !visible.length) continue;                  // hide non-matching folders while searching
    const open = q ? true : browseOpen.has(t.key);       // collapsed by default; search expands matches
    const node = document.createElement("div");
    node.className = "tnode" + (open ? " open" : "");
    const count = q ? `${visible.length} of ${total}` : `${total}`;
    node.innerHTML = `<button class="tfhead" type="button" aria-expanded="${open}">
        <span class="tchev">▸</span><span class="tfico">📁</span>
        <span class="tflabel">${esc(t.label)}</span><span class="tcount">${esc(count)}</span></button>
      <div class="tfiles"><div class="assetgrid tgrid"></div></div>`;
    const grid = node.querySelector(".tgrid");
    const fill = () => { if (grid.childElementCount) return; for (const a of visible) grid.appendChild(assetCard(t.key, a)); };
    if (open) fill();                                     // populate (lazily) only when shown
    if (!q) node.querySelector(".tfhead").addEventListener("click", () => {
      const o = browseOpen.has(t.key);
      if (o) browseOpen.delete(t.key); else { browseOpen.add(t.key); fill(); }
      node.classList.toggle("open", !o);
      node.querySelector(".tfhead").setAttribute("aria-expanded", String(!o));
    });
    tree.appendChild(node);
  }
}

async function openAsset(typeKey, a) {
  const url = await blobUrl(typeKey, a.file);
  $("#preview-title").textContent = a.brand;
  $("#preview-sub").textContent = `${TYPES.find((x) => x.key === typeKey).label} · ${a.ext.toUpperCase()}`;
  const frame = $("#preview-frame"), img = $("#preview-img"), vid = $("#preview-video"), load = $("#preview-loading");
  frame.hidden = img.hidden = vid.hidden = true; load.hidden = false;
  frame.src = "about:blank"; img.removeAttribute("src"); vid.removeAttribute("src");
  if (a.kind === "pdf") { frame.hidden = false; frame.onload = () => load.hidden = true; frame.src = url; setTimeout(() => load.hidden = true, 1200); }
  else if (a.kind === "video") { vid.src = url; vid.hidden = false; load.hidden = true; }
  else { img.onload = () => load.hidden = true; img.src = url; img.hidden = false; setTimeout(() => load.hidden = true, 800); }
  $("#preview").hidden = false;
}
function closeModal() {
  $("#preview").hidden = true;
  $("#preview-frame").src = "about:blank"; $("#preview-video").removeAttribute("src"); $("#preview-img").removeAttribute("src");
  if (state.modalUrl) { URL.revokeObjectURL(state.modalUrl); state.modalUrl = null; }
}
function expandLive() {
  if (!state.live.bytes) return;
  if (state.modalUrl) URL.revokeObjectURL(state.modalUrl);
  state.modalUrl = URL.createObjectURL(new Blob([state.live.bytes], { type: "application/pdf" }));
  $("#preview-title").textContent = `${state.profileName} — Logos`; $("#preview-sub").textContent = "Live preview";
  const frame = $("#preview-frame"), img = $("#preview-img"), vid = $("#preview-video"), load = $("#preview-loading");
  img.hidden = vid.hidden = true; frame.hidden = false; load.hidden = false;
  frame.onload = () => load.hidden = true; frame.src = state.modalUrl + "#toolbar=0&navpanes=0&view=FitH"; setTimeout(() => load.hidden = true, 1000);
  $("#preview").hidden = false;
}

// ====== Settings / folder ===================================================
function renderSettings() {
  $("#fs-supported").hidden = !fsAccessSupported();
  $("#fs-unsupported").hidden = fsAccessSupported();
  $("#settings-source").textContent = state.isDemo ? "Showing the built-in demo portfolio." : `Linked: ${state.profileName}`;
  $("#disconnect-folder").hidden = state.isDemo;
}
async function connectFolder() {
  try {
    const h = await window.showDirectoryPicker({ mode: "read" });
    if (!(await verifyPermission(h))) return;
    state.pendingHandle = null; await saveHandle(h); await useFolder(h); toast(`Linked ${state.profileName}`);
  } catch (e) { if (e.name !== "AbortError") toast("Couldn't open that folder", "err"); }
}
async function disconnectFolder() { state.pendingHandle = null; await clearHandle(); await useDemo(); toast("Disconnected", "warn"); }
async function reconnectFolder() {
  const h = state.pendingHandle; if (!h) return connectFolder();
  if (await verifyPermission(h)) { state.pendingHandle = null; await saveHandle(h); await useFolder(h); toast(`Reconnected ${state.profileName}`); }
}
function showReconnectBanner() {
  $("#banner-text").innerHTML = `Portfolio <strong>${esc(state.pendingHandle?.name || "")}</strong> is saved — reconnect to continue.`;
  $("#banner-connect").textContent = "Reconnect →"; $("#connect-banner").hidden = false;
}

// ====== dark mode ===========================================================
function applyTheme(t) { document.documentElement.dataset.theme = t; $("#theme-toggle").textContent = t === "dark" ? "☀" : "☾"; localStorage.setItem("ls-theme", t); }
function initTheme() { applyTheme(localStorage.getItem("ls-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")); }

// ====== command palette =====================================================
let PALETTE = [], palIdx = 0;
function buildPalette() {
  PALETTE = [
    { label: "Logos showcase", run: () => switchView("logos") },
    ...(state.types.length ? [{ label: "Files · browse folders", run: () => switchView("browse") }] : []),
    ...state.types.filter((t) => t.key !== "logos").map((t) => ({ label: `Open · ${t.label}`, run: () => switchView(`assets:${t.key}`) })),
    { label: "Settings", run: () => switchView("settings") },
    { label: "Output · Slice", run: () => { setSeg($("#opt-mode"), "slice"); mk.mode = "slice"; syncMode(); scheduleRender(60); } },
    { label: "Output · Range sheet", run: () => { setSeg($("#opt-mode"), "range"); mk.mode = "range"; syncMode(); scheduleRender(60); } },
    { label: "View deck fullscreen", key: "⌘↵", run: expandLive },
    { label: "Toggle dark mode", key: "⌘D", run: () => applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark") },
    { label: "Link portfolio folder", run: connectFolder },
  ];
}
function openPalette() { $("#palette").hidden = false; $("#palette-input").value = ""; palIdx = 0; renderPalette(""); setTimeout(() => $("#palette-input").focus(), 30); }
const closePalette = () => { $("#palette").hidden = true; };
function renderPalette(q) {
  const list = PALETTE.filter((c) => c.label.toLowerCase().includes(q.toLowerCase()));
  const box = $("#palette-list"); box.innerHTML = "";
  list.forEach((c, i) => { const el = document.createElement("div"); el.className = "palette-item" + (i === palIdx ? " active" : ""); el.innerHTML = `<span>${c.label}</span>${c.key ? `<span class="pk">${c.key}</span>` : ""}`; el.onclick = () => { closePalette(); c.run(); }; box.appendChild(el); });
  box._list = list;
}

// ====== segmented helper ====================================================
function setSeg(el, val) { el.querySelectorAll(".seg").forEach((b) => { const a = b.dataset.val === val; b.classList.toggle("active", a); b.setAttribute("aria-checked", String(a)); }); }
function wireSeg(el, cb) { el.querySelectorAll(".seg").forEach((b) => b.addEventListener("click", () => { setSeg(el, b.dataset.val); cb(b.dataset.val); })); }
function syncMode() {
  const lay = $("#opt-layout"); const dim = mk.mode !== "slice";
  lay.style.opacity = dim ? ".4" : "1"; lay.style.pointerEvents = dim ? "none" : "";
  $("#pertype-block").style.display = mk.mode === "bytype" ? "" : "none";
}
function syncLayout() { const f = $("#opt-cols-field"); const lb = mk.layout === "lookbook"; f.style.opacity = lb ? ".4" : "1"; f.style.pointerEvents = lb ? "none" : ""; }

// ====== wiring ==============================================================
function wire() {
  // logos picker
  $("#logos-search").addEventListener("input", renderPicker);
  $("#logos-all").addEventListener("click", () => { state.picked = imageLogos().map((a) => a.file); renderPicker(); scheduleRender(120); });
  $("#logos-none").addEventListener("click", () => { state.picked = []; renderPicker(); scheduleRender(120); });
  wireSeg($("#opt-mode"), (v) => { mk.mode = v; syncMode(); scheduleRender(60); });
  wireSeg($("#opt-layout"), (v) => { mk.layout = v; syncLayout(); scheduleRender(60); });
  wireSeg($("#opt-density"), (v) => { mk.density = v; scheduleRender(60); });
  $("#opt-cols").addEventListener("change", (e) => { mk.columns = e.target.value; scheduleRender(60); });
  $("#opt-cover").addEventListener("change", (e) => { mk.cover = e.target.checked; scheduleRender(60); });
  $("#opt-closing").addEventListener("change", (e) => { mk.closing = e.target.checked; scheduleRender(60); });
  $("#opt-pertype").addEventListener("change", (e) => { mk.perType = e.target.value; scheduleRender(60); });
  $("#preview-download2").addEventListener("click", downloadLive);
  $("#preview-expand").addEventListener("click", expandLive);
  // filters (industry datalist + logo-type select)
  $("#industry-list").innerHTML = INDUSTRIES.map((v) => `<option value="${v}">`).join("");
  $("#filter-type").innerHTML = `<option value="">All types</option>` + LOGO_TYPES.map((v) => `<option value="${v}">${v}</option>`).join("");
  $("#filter-industry").addEventListener("input", (e) => { filters.industry = e.target.value.trim().toLowerCase().replace(/\s+/g, "-"); state.picked = []; renderPicker(); scheduleRender(120); });
  $("#filter-type").addEventListener("change", (e) => { filters.type = e.target.value; state.picked = []; renderPicker(); scheduleRender(120); });
  $$(".cta").forEach((c) => c.addEventListener("mousemove", (e) => { const r = c.getBoundingClientRect(); c.style.setProperty("--x", `${e.clientX - r.left}px`); c.style.setProperty("--y", `${e.clientY - r.top}px`); }));

  // assets + files tree
  $("#assets-search").addEventListener("input", () => currentType && renderAssets(currentType));
  $("#browse-search").addEventListener("input", renderBrowse);

  // folder / theme / palette
  $("#connect-folder").addEventListener("click", connectFolder);
  $("#banner-connect").addEventListener("click", reconnectFolder);
  $("#disconnect-folder").addEventListener("click", disconnectFolder);
  $("#theme-toggle").addEventListener("click", () => applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));
  $("#open-palette").addEventListener("click", openPalette);
  $("#palette-input").addEventListener("input", (e) => { palIdx = 0; renderPalette(e.target.value); });
  $$("[data-close]").forEach((b) => b.addEventListener("click", closeModal));
  $$("[data-palette-close]").forEach((b) => b.addEventListener("click", closePalette));

  document.addEventListener("keydown", onKey);
  syncMode(); syncLayout();
}
function onKey(e) {
  const meta = e.metaKey || e.ctrlKey;
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
  if (meta && e.key.toLowerCase() === "k") { e.preventDefault(); return $("#palette").hidden ? openPalette() : closePalette(); }
  if (!$("#palette").hidden) {
    const list = $("#palette-list")._list || [];
    if (e.key === "ArrowDown") { e.preventDefault(); palIdx = Math.min(palIdx + 1, list.length - 1); renderPalette($("#palette-input").value); }
    else if (e.key === "ArrowUp") { e.preventDefault(); palIdx = Math.max(palIdx - 1, 0); renderPalette($("#palette-input").value); }
    else if (e.key === "Enter") { e.preventDefault(); const c = list[palIdx]; if (c) { closePalette(); c.run(); } }
    else if (e.key === "Escape") closePalette();
    return;
  }
  if (e.key === "Escape" && !$("#preview").hidden) return closeModal();
  if (meta && e.key === "Enter") { e.preventDefault(); return downloadLive(); }
  if (meta && e.key.toLowerCase() === "d") { e.preventDefault(); return applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"); }
  if (typing) return;
  if (e.key === "/") {
    const s = currentView === "browse" ? $("#browse-search")
      : currentView.startsWith("assets:") ? $("#assets-search") : $("#logos-search");
    if (s) { e.preventDefault(); s.focus(); }
  }
}

async function init() {
  initTheme(); wire();
  if (fsAccessSupported()) {
    try {
      const h = await loadHandle();
      if (h) {
        const perm = await h.queryPermission({ mode: "read" });
        if (perm === "granted") { await useFolder(h); return; }
        state.pendingHandle = h; await useDemo(); showReconnectBanner(); return;
      }
    } catch (e) { /* demo */ }
  }
  await useDemo();
}
init();
