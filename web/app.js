// App controller — live preview engine, presentation options, dark mode,
// toasts, gallery (reorder/detail/sort), and a command palette.
import {
  FsSource, FetchSource, saveHandle, loadHandle, clearHandle,
  verifyPermission, fsAccessSupported,
} from "./src/source.js";
import { parseLibrary, activeEntries, matches } from "./src/library.js";
import { parseTheme } from "./src/theme.js";
import { curate, describeQuery, typeLabel, titleCase } from "./src/curate.js";
import { renderSlice, renderRange } from "./src/pdf.js";
import { INDUSTRIES, TYPES } from "./src/vocab.js";

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const LAST_PROFILE = "ls-last-profile";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const state = {
  source: new FetchSource("demo"), sourceLabel: "Demo logos", isDemo: true, srcGen: 0,
  profiles: new Map(), meta: new Map(), thumbs: new Map(),
  pendingHandle: null,
  live: { bytes: null, url: null, profile: null, running: false, pending: false, wantId: 0 },
  modalUrl: null,
};

// ====== data ===============================================================
async function getMeta(profile) {
  if (state.meta.has(profile)) return state.meta.get(profile);
  const json = await state.source.getText(profile, "theme.json").catch(() => "{}");
  const t = parseTheme(json, profile);
  state.meta.set(profile, t);
  return t;
}
async function loadProfile(profile) {
  if (state.profiles.has(profile)) return state.profiles.get(profile);
  const [csv, themeJson] = await Promise.all([
    state.source.getText(profile, "tags.csv"),
    state.source.getText(profile, "theme.json").catch(() => "{}"),
  ]);
  const data = { entries: parseLibrary(csv), theme: parseTheme(themeJson, profile) };
  state.profiles.set(profile, data);
  return data;
}
const unionValues = (entries, key) => {
  const s = new Set(); activeEntries(entries).forEach((e) => e[key].forEach((v) => s.add(v)));
  return [...s].sort();
};
async function thumbUrl(profile, file) {
  const k = `${profile}/${file}`;
  if (state.thumbs.has(k)) return state.thumbs.get(k);
  const gen = state.srcGen;
  const url = URL.createObjectURL(await state.source.getBlob(profile, `logos/${file}`));
  if (gen !== state.srcGen) { URL.revokeObjectURL(url); return url; } // source switched mid-load
  state.thumbs.set(k, url); return url;
}
const defaultDate = () => new Date().toLocaleString("en-US", { month: "long", year: "numeric" });
function downloadUrl(url, filename) {
  const a = document.createElement("a"); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
}

// ====== toasts =============================================================
function toast(msg, kind = "ok") {
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.innerHTML = `<span>${kind === "err" ? "✕" : kind === "warn" ? "!" : "✓"}</span><span>${esc(msg)}</span>`;
  $("#toasts").appendChild(el);
  const kill = () => { el.classList.add("out"); setTimeout(() => el.remove(), 220); };
  const t = setTimeout(kill, 3200);
  el.addEventListener("mouseenter", () => clearTimeout(t));
  el.addEventListener("mouseleave", () => setTimeout(kill, 1200));
}

// ====== presentation state =================================================
const mk = { industries: new Set(), types: new Set(), match: "any", mode: "slice",
  layout: "grid", columns: "", density: "", cover: true, closing: true };

function currentOpts() {
  return {
    dateStr: defaultDate(),
    layout: mk.layout,
    columns: mk.columns ? parseInt(mk.columns, 10) : null,
    density: mk.density || null,
    includeCover: mk.cover,
    includeClosing: mk.closing,
  };
}

// ====== live preview engine ================================================
function setPreviewStatus(busy) {
  const s = $("#preview-status"); s.classList.toggle("busy", busy);
  $("#preview-status-text").textContent = busy ? "Updating…" : "Up to date";
  $("#preview-shell").classList.toggle("updating", busy);
}
let renderTimer = null;
function scheduleRender(delay = 350) {
  state.live.wantId++;            // mark that newer output is wanted
  setPreviewStatus(true);
  clearTimeout(renderTimer);
  renderTimer = setTimeout(runRender, delay);
}
async function buildCurrent() {
  const profile = $("#make-profile").value;
  if (!profile) throw new Error("No studio selected");
  const { entries, theme } = await loadProfile(profile);
  const q = { industries: [...mk.industries], types: [...mk.types], matchAll: mk.match === "all" };
  const count = parseInt($("#make-count").value, 10) || 12;
  const chosen = curate(entries, q, mk.mode === "slice" ? count : null);
  if (!chosen.length) throw new Error(`No logos match [${describeQuery(q.industries, q.types, q.matchAll)}]`);
  const opts = currentOpts();
  const bytes = mk.mode === "slice"
    ? await renderSlice(state.source, profile, theme, chosen, q, opts)
    : await renderRange(state.source, profile, theme, chosen, q, opts);
  return { bytes, theme, n: chosen.length, profile };
}
async function runRender() {
  if (state.live.running) { state.live.pending = true; return; }
  state.live.running = true;
  const myId = state.live.wantId;
  setPreviewStatus(true);
  $("#preview-status").classList.remove("err");
  try {
    const r = await buildCurrent();
    if (myId !== state.live.wantId) return;   // superseded — a newer render is queued; drop this output
    if (state.live.url) URL.revokeObjectURL(state.live.url);
    state.live.bytes = r.bytes;
    state.live.profile = r.profile;
    state.live.url = URL.createObjectURL(new Blob([r.bytes], { type: "application/pdf" }));
    const frame = $("#live-frame");
    frame.onload = null;
    frame.onload = () => { $("#preview-skeleton").hidden = true; frame.hidden = false; setPreviewStatus(false); };
    frame.src = state.live.url + "#toolbar=0&navpanes=0&view=FitH";
    $("#preview-skeleton").hidden = true; frame.hidden = false;
  } catch (e) {
    if (myId === state.live.wantId) {
      setPreviewStatus(false);
      $("#preview-status-text").textContent = e.message;
      $("#preview-status").classList.add("err");
    }
  } finally {
    state.live.running = false;
    if (state.live.pending || myId !== state.live.wantId) { state.live.pending = false; runRender(); }
    else if (!$("#preview-status").classList.contains("err")) setPreviewStatus(false);
  }
}
function whenRenderIdle(timeout = 5000) {
  return new Promise((res) => {
    const start = Date.now();
    const t = setInterval(() => {
      if ((!state.live.running && !state.live.pending) || Date.now() - start > timeout) { clearInterval(t); res(); }
    }, 70);
  });
}
async function downloadLive() {
  const btn = $("#preview-download2");
  if (state.live.running || state.live.pending || !state.live.bytes) {
    setBusy(btn, true);
    if (!state.live.bytes && !state.live.running) scheduleRender(0);
    await whenRenderIdle();
    setBusy(btn, false);
  }
  if (!state.live.bytes) { toast("Nothing to download yet", "warn"); return; }
  downloadUrl(state.live.url, `${state.live.profile || $("#make-profile").value}-${mk.mode}.pdf`);
  btn.classList.add("success");
  const lab = btn.querySelector(".cta-label"); const old = lab.textContent; lab.textContent = "✓ Saved";
  setTimeout(() => { btn.classList.remove("success"); lab.textContent = old; }, 1400);
  toast("PDF downloaded");
}

// ====== modal preview (gallery + expand) ===================================
function openModal(bytes, filename, sub) {
  if (state.modalUrl) URL.revokeObjectURL(state.modalUrl);
  state.modalUrl = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  $("#preview-title").textContent = filename;
  $("#preview-sub").textContent = sub;
  const frame = $("#preview-frame"); $("#preview-loading").hidden = false; frame.hidden = true;
  frame.onload = () => { $("#preview-loading").hidden = true; frame.hidden = false; };
  frame.src = state.modalUrl + "#view=FitH";
  setTimeout(() => { $("#preview-loading").hidden = true; frame.hidden = false; }, 1200);
  $("#preview-download").onclick = () => { downloadUrl(state.modalUrl, filename); toast("PDF downloaded"); };
  $("#preview-open").onclick = () => window.open(state.modalUrl, "_blank");
  $("#preview").hidden = false;
}
function closeModal() {
  $("#preview").hidden = true; $("#preview-frame").src = "about:blank";
  if (state.modalUrl) { URL.revokeObjectURL(state.modalUrl); state.modalUrl = null; }
}

// ====== source switching ===================================================
async function useDemo() { state.source = new FetchSource("demo"); state.sourceLabel = "Demo logos"; state.isDemo = true; await onSourceChanged(); }
async function useFolder(h) { state.source = new FsSource(h); state.sourceLabel = h.name || "Local folder"; state.isDemo = false; await onSourceChanged(); }
async function onSourceChanged() {
  state.srcGen++;
  state.profiles.clear(); state.meta.clear();
  state.thumbs.forEach((u) => URL.revokeObjectURL(u)); state.thumbs.clear();
  $("#source-text").textContent = state.sourceLabel;
  $("#source-badge").classList.toggle("live", !state.isDemo);
  $("#connect-banner").hidden = !state.isDemo || !fsAccessSupported();
  renderSettings();
  await refreshProfiles();
}
async function refreshProfiles() {
  let names = [], err = null;
  try { names = await state.source.listProfiles(); } catch (e) { err = e; console.error(e); }
  const opts = [];
  for (const n of names) { try { opts.push([n, (await getMeta(n)).name]); } catch { opts.push([n, n]); } }
  for (const sel of ["#make-profile", "#gal-profile"]) {
    $(sel).innerHTML = opts.map(([v, l]) => `<option value="${v}">${l}</option>`).join("");
  }
  const empty = $("#no-studios");
  if (!names.length) {
    empty.hidden = false;
    empty.innerHTML = state.isDemo ? "No demo studios available."
      : `No studios found in <b>${state.sourceLabel}</b>. Each studio needs its own sub-folder `
        + `with a <code>tags.csv</code> file. <button class="link" id="goto-guide">See the folder guide →</button>`
        + (err ? `<br><small class="muted">${err.message}</small>` : "");
    const g = document.getElementById("goto-guide"); if (g) g.onclick = () => switchView("settings");
    $("#live-frame").hidden = true; $("#preview-skeleton").hidden = false; setPreviewStatus(false);
    return;
  }
  empty.hidden = true;
  const last = localStorage.getItem(LAST_PROFILE);
  if (last && names.includes(last)) { $("#make-profile").value = last; $("#gal-profile").value = last; }
  await onMakeProfile();
  await loadGallery();
  buildPalette();
}

// ====== Create view ========================================================
function renderPills(container, values, set, counts, onChange) {
  container.innerHTML = "";
  values.forEach((v) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "pill"; b.dataset.value = v;
    b.setAttribute("aria-pressed", set.has(v) ? "true" : "false");
    const c = counts ? `<span class="pc">${counts[v] || 0}</span>` : "";
    b.innerHTML = `${v.replace(/-/g, " ")}${c}`;
    if (set.has(v)) b.classList.add("active");
    b.addEventListener("click", () => {
      const on = !set.has(v);
      if (on) set.add(v); else set.delete(v);
      b.classList.toggle("active", on); b.setAttribute("aria-pressed", String(on));
      onChange && onChange();
    });
    container.appendChild(b);
  });
}
async function onMakeProfile() {
  const profile = $("#make-profile").value;
  if (!profile) return;
  localStorage.setItem(LAST_PROFILE, profile);
  mk.industries.clear(); mk.types.clear();
  try {
    const { entries } = await loadProfile(profile);
    renderPills($("#make-industries"), unionValues(entries, "industries"), mk.industries, null, scheduleRender);
    renderPills($("#make-types"), unionValues(entries, "types"), mk.types, null, scheduleRender);
    const t = await getMeta(profile);
    const sw = $("#make-swatches"); sw.innerHTML = "";
    [t.palette.cover_bg, t.palette.accent, t.palette.ink, t.palette.paper].forEach((c) => {
      const s = document.createElement("span"); s.style.background = c; sw.appendChild(s);
    });
    scheduleRender(60);
  } catch (e) { toast(e.message, "err"); }
}
function setBusy(btn, busy) {
  btn.disabled = busy;
  const sp = btn.querySelector(".cta-spin"); if (sp) sp.hidden = !busy;
}
function syncMode() {
  const range = mk.mode === "range";
  $("#make-count-block").style.display = range ? "none" : "";
  // Layout (grid/lookbook) only applies to slice; range is always a contact sheet.
  const lay = $("#opt-layout"); lay.style.opacity = range ? ".4" : "1"; lay.style.pointerEvents = range ? "none" : "";
}
function syncLayout() {
  const f = $("#opt-cols-field"); f.style.opacity = mk.layout === "lookbook" ? ".4" : "1"; f.style.pointerEvents = mk.layout === "lookbook" ? "none" : "";
}

// ====== Recents ============================================================
const loadRecents = () => { try { return JSON.parse(localStorage.getItem("ls-recents") || "[]"); } catch { return []; } };
function pushRecent(r) {
  let list = loadRecents().filter((x) => !(x.profile === r.profile && x.mode === r.mode
    && JSON.stringify(x.industries) === JSON.stringify(r.industries) && JSON.stringify(x.types) === JSON.stringify(r.types)));
  list.unshift(r); list = list.slice(0, 6);
  localStorage.setItem("ls-recents", JSON.stringify(list)); renderRecents();
}
function renderRecents() {
  const list = loadRecents(); $("#recent-wrap").hidden = list.length === 0;
  const w = $("#recent-list"); w.innerHTML = "";
  list.forEach((r) => {
    const b = document.createElement("button"); b.className = "chip-recent";
    const scope = [...(r.industries || []), ...(r.types || [])].slice(0, 2).join(", ") || "all";
    b.innerHTML = `<b>${r.name}</b> · ${r.mode} · ${scope}`;
    b.onclick = () => applyRecent(r); w.appendChild(b);
  });
}
async function applyRecent(r) {
  $("#make-profile").value = r.profile; await onMakeProfile();
  (r.industries || []).forEach((v) => togglePill($("#make-industries"), v, mk.industries, true));
  (r.types || []).forEach((v) => togglePill($("#make-types"), v, mk.types, true));
  setSeg($("#make-match"), r.match || "any"); mk.match = r.match || "any";
  setSeg($("#make-mode"), r.mode || "slice"); mk.mode = r.mode || "slice"; syncMode();
  if (r.count) { $("#make-count").value = r.count; $("#count-val").textContent = r.count; }
  scheduleRender(60);
}
function togglePill(c, value, set, on) {
  const btn = [...c.querySelectorAll(".pill")].find((b) => b.dataset.value === value);
  if (btn) { btn.classList.toggle("active", on); btn.setAttribute("aria-pressed", String(on)); if (on) set.add(value); else set.delete(value); }
}
function setSeg(el, val) { el.querySelectorAll(".seg").forEach((b) => { const a = b.dataset.val === val; b.classList.toggle("active", a); b.setAttribute("aria-checked", String(a)); }); }
function wireSeg(el, cb) {
  el.querySelectorAll(".seg").forEach((b) => b.addEventListener("click", () => { setSeg(el, b.dataset.val); cb(b.dataset.val); }));
}

// ====== Gallery ============================================================
const gal = { entries: [], theme: null, profile: "", industries: new Set(), types: new Set(),
  match: "any", search: "", sort: "tier", order: [], sel: new Set() };

async function loadGallery() {
  const profile = $("#gal-profile").value; if (!profile) return;
  localStorage.setItem(LAST_PROFILE, profile);
  gal.profile = profile; gal.industries.clear(); gal.types.clear(); gal.order = []; gal.sel.clear(); gal.search = "";
  $("#gal-search").value = "";
  const { entries, theme } = await loadProfile(profile);
  gal.entries = activeEntries(entries); gal.theme = theme;
  const ic = {}, tc = {};
  gal.entries.forEach((e) => { e.industries.forEach((i) => ic[i] = (ic[i] || 0) + 1); e.types.forEach((t) => tc[t] = (tc[t] || 0) + 1); });
  renderPills($("#gal-industries"), unionValues(entries, "industries"), gal.industries, ic, renderGallery);
  renderPills($("#gal-types"), unionValues(entries, "types"), gal.types, tc, renderGallery);
  renderGallery();
}
function galMatch(e) {
  if (!matches(e, [...gal.industries], [...gal.types], gal.match === "all")) return false;
  return !gal.search || e.name.toLowerCase().includes(gal.search.toLowerCase());
}
function sortEntries(list) {
  const s = gal.sort;
  return [...list].sort((a, b) =>
    s === "name" ? a.name.localeCompare(b.name)
    : s === "year" ? (b.year ?? -1) - (a.year ?? -1) || a.tier - b.tier
    : a.tier - b.tier || (b.year ?? -1) - (a.year ?? -1));
}
async function renderGallery() {
  const grid = $("#gal-grid");
  const visible = sortEntries(gal.entries.filter(galMatch));
  grid.innerHTML = "";
  for (const e of visible) {
    const el = document.createElement("div");
    el.className = "lcard" + (gal.sel.has(e.file) ? " sel" : "");
    el.innerHTML = `<div class="thumb"><img alt="${esc(e.name)}"><span class="check">✓</span>
      <button class="info" title="Details" aria-label="Details">i</button></div>
      <div class="cap"><span class="tier">T${e.tier}</span><span class="nm">${esc(e.name)}</span><span class="mt">${esc(typeLabel(e.types))}</span></div>`;
    el.querySelector("img").src = await thumbUrl(gal.profile, e.file);
    el.querySelector(".info").addEventListener("click", (ev) => { ev.stopPropagation(); openDetail(e); });
    el.addEventListener("click", () => toggleSelect(e.file));
    grid.appendChild(el);
  }
  $("#gal-empty").hidden = visible.length !== 0;
  $("#gal-count").textContent = `${visible.length} of ${gal.entries.length}`;
  renderTray();
}
function toggleSelect(file) {
  if (gal.sel.has(file)) { gal.sel.delete(file); gal.order = gal.order.filter((f) => f !== file); }
  else { gal.sel.add(file); gal.order.push(file); }
  renderGallery();
}
function renderTray() {
  const bar = $("#gal-selbar"), tray = $("#gal-tray");
  bar.hidden = gal.order.length === 0;
  $("#gal-selcount").textContent = String(gal.order.length);
  tray.innerHTML = "";
  const byFile = new Map(gal.entries.map((e) => [e.file, e]));
  gal.order.forEach((file) => {
    const e = byFile.get(file); if (!e) return;
    const chip = document.createElement("div");
    chip.className = "tray-item"; chip.draggable = true; chip.dataset.file = file;
    chip.innerHTML = `<img alt=""><span>${esc(e.name)}</span><button class="rm" aria-label="Remove">×</button>`;
    thumbUrl(gal.profile, file).then((u) => { const im = chip.querySelector("img"); if (im) im.src = u; });
    chip.querySelector(".rm").addEventListener("click", (ev) => { ev.stopPropagation(); toggleSelect(file); });
    tray.appendChild(chip);
  });
}
// Drag-reorder: move the DOM node live, commit gal.order from DOM on drop —
// avoids the stale-index corruption of re-rendering mid-drag.
function dragAfter(container, x) {
  let closest = { offset: -Infinity, el: null };
  for (const child of container.querySelectorAll(".tray-item:not(.dragging)")) {
    const box = child.getBoundingClientRect();
    const offset = x - box.left - box.width / 2;
    if (offset < 0 && offset > closest.offset) closest = { offset, el: child };
  }
  return closest.el;
}
function commitTrayOrder() {
  gal.order = [...$("#gal-tray").querySelectorAll(".tray-item")].map((c) => c.dataset.file);
}
function wireTrayDrag() {
  const tray = $("#gal-tray");
  tray.addEventListener("dragstart", (e) => { const it = e.target.closest(".tray-item"); if (it) { it.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; } });
  tray.addEventListener("dragend", (e) => { const it = e.target.closest(".tray-item"); if (it) it.classList.remove("dragging"); commitTrayOrder(); });
  tray.addEventListener("dragover", (e) => {
    e.preventDefault();
    const dragging = tray.querySelector(".dragging"); if (!dragging) return;
    const after = dragAfter(tray, e.clientX);
    if (after == null) tray.appendChild(dragging); else tray.insertBefore(dragging, after);
  });
}
async function galPreview() {
  if (!gal.order.length) return;
  const byFile = new Map(gal.entries.map((e) => [e.file, e]));
  const chosen = gal.order.map((f) => byFile.get(f)).filter(Boolean); // preserve manual order
  const btn = $("#gal-preview"); setBusy(btn, true);
  try {
    const q = { industries: [], types: [], matchAll: false };
    const bytes = await renderSlice(state.source, gal.profile, gal.theme, chosen, q, { dateStr: defaultDate() });
    openModal(bytes, `${gal.profile}-selection.pdf`, `${gal.theme.name} · ${chosen.length} marks`);
  } catch (e) { toast(e.message, "err"); } finally { setBusy(btn, false); }
}
function openDetail(e) {
  $("#detail-name").textContent = e.name;
  thumbUrl(gal.profile, e.file).then((u) => $("#detail-img").src = u);
  const row = (k, v) => `<div class="drow"><span class="dk">${k}</span><span class="dv">${v}</span></div>`;
  const tags = (arr) => arr.map((x) => `<span class="tagword">${x}</span>`).join(" ");
  $("#detail-meta").innerHTML =
    row("Tier", `T${e.tier}`) + (e.year ? row("Year", e.year) : "") +
    row("Industries", tags(e.industries)) + row("Types", tags(e.types)) +
    (e.notes ? row("Notes", esc(e.notes)) : "") +
    `<div class="drow"><span class="dk">File</span><span class="dv mono">${esc(e.file)}
      <button class="mini" id="copy-file">copy</button></span></div>`;
  $("#detail").hidden = false;
  const cf = $("#copy-file"); if (cf) cf.onclick = () => { navigator.clipboard?.writeText(e.file); toast("Filename copied"); };
}
const closeDetail = () => { $("#detail").hidden = true; };

// ====== Settings + folder ==================================================
function renderSettings() {
  $("#fs-supported").hidden = !fsAccessSupported();
  $("#fs-unsupported").hidden = fsAccessSupported();
  $("#settings-source").textContent = state.isDemo ? "Using the built-in demo logos." : `Connected to: ${state.sourceLabel}`;
  $("#disconnect-folder").hidden = state.isDemo;
}
async function connectFolder() {
  try {
    const h = await window.showDirectoryPicker({ mode: "read" });
    if (!(await verifyPermission(h))) return;
    state.pendingHandle = null; await saveHandle(h); await useFolder(h); switchView("make"); toast("Folder connected");
  } catch (e) { if (e.name !== "AbortError") toast("Couldn't open that folder", "err"); }
}
async function disconnectFolder() { state.pendingHandle = null; await clearHandle(); await useDemo(); toast("Folder disconnected", "warn"); }
async function reconnectFolder() {
  const h = state.pendingHandle; if (!h) return connectFolder();
  if (await verifyPermission(h)) { state.pendingHandle = null; await saveHandle(h); await useFolder(h); switchView("make"); toast("Folder reconnected"); }
}
function showReconnectBanner() {
  $("#banner-text").innerHTML = `Library folder <strong>${state.pendingHandle?.name || ""}</strong> is saved — reconnect to continue.`;
  $("#banner-connect").textContent = "Reconnect →"; $("#connect-banner").hidden = false;
}

// ====== view switching =====================================================
function switchView(view) {
  $$(".tab").forEach((t) => { const a = t.dataset.view === view; t.classList.toggle("active", a); t.setAttribute("aria-selected", String(a)); });
  $$(".view").forEach((v) => { v.hidden = v.id !== `view-${view}`; });
  if (view === "gallery") loadGallery();
}

// ====== dark mode ==========================================================
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  $("#theme-toggle").textContent = t === "dark" ? "☀" : "☾";
  localStorage.setItem("ls-theme", t);
}
function initTheme() {
  const saved = localStorage.getItem("ls-theme");
  const t = saved || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  applyTheme(t);
}

// ====== command palette ====================================================
let PALETTE = []; let palIdx = 0;
function buildPalette() {
  const names = $$("#make-profile option").map((o) => [o.value, o.textContent]);
  PALETTE = [
    ...names.map(([v, l]) => ({ label: `Studio · ${l}`, run: () => { $("#make-profile").value = v; onMakeProfile(); switchView("make"); } })),
    { label: "Go to Create", key: "1", run: () => switchView("make") },
    { label: "Go to Gallery", key: "2", run: () => switchView("gallery") },
    { label: "Go to Settings", key: "3", run: () => switchView("settings") },
    { label: "Output · Slice", run: () => { setSeg($("#make-mode"), "slice"); mk.mode = "slice"; syncMode(); scheduleRender(60); } },
    { label: "Output · Range sheet", run: () => { setSeg($("#make-mode"), "range"); mk.mode = "range"; syncMode(); scheduleRender(60); } },
    { label: "Layout · Grid", run: () => { setSeg($("#opt-layout"), "grid"); mk.layout = "grid"; syncLayout(); scheduleRender(60); } },
    { label: "Layout · Lookbook", run: () => { setSeg($("#opt-layout"), "lookbook"); mk.layout = "lookbook"; syncLayout(); scheduleRender(60); } },
    { label: "Download PDF", key: "⌘↵", run: downloadLive },
    { label: "Toggle dark mode", key: "⌘D", run: () => applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark") },
    { label: "Connect library folder", run: connectFolder },
  ];
}
function openPalette() {
  $("#palette").hidden = false; $("#palette-input").value = ""; palIdx = 0; renderPalette("");
  setTimeout(() => $("#palette-input").focus(), 30);
}
const closePalette = () => { $("#palette").hidden = true; };
function renderPalette(q) {
  const list = PALETTE.filter((c) => c.label.toLowerCase().includes(q.toLowerCase()));
  const box = $("#palette-list"); box.innerHTML = "";
  list.forEach((c, i) => {
    const el = document.createElement("div"); el.className = "palette-item" + (i === palIdx ? " active" : "");
    el.innerHTML = `<span>${c.label}</span>${c.key ? `<span class="pk">${c.key}</span>` : ""}`;
    el.onclick = () => { closePalette(); c.run(); };
    box.appendChild(el);
  });
  box._list = list;
}

// ====== wiring =============================================================
const TAGS_TEMPLATE = `file,name,industries,types,tier,year,active,notes
example-logo.png,Example Brand,construction|real-estate,combination,1,2025,true,first row is the header
another-mark.png,Another Mark,finance-banking,wordmark,2,2024,true,
`;
const THEME_TEMPLATE = JSON.stringify({ id: "my-studio", name: "My Studio", sort_primary: "industry",
  palette: { ink: "#15181E", paper: "#FFFFFF", accent: "#7229FF", accent_soft: "#F1EBFF", muted: "#6B7280", cover_bg: "#15181E", cover_fg: "#FFFFFF" },
  fonts: { display: "Archivo", body: "Archivo", serif: "Spectral" },
  layout: { cover_style: "editorial", tile_cols: 3, tile_radius_mm: 3, density: "comfortable" },
  labels: { slice_kicker: "Selected work", range_title: "Full range" } }, null, 2);
function downloadText(name, text, mime) {
  const url = URL.createObjectURL(new Blob([text], { type: mime })); downloadUrl(url, name); setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function renderGuide() {
  if ($("#vocab-industries")) $("#vocab-industries").innerHTML = INDUSTRIES.map((v) => `<span class="tagword">${v}</span>`).join("");
  if ($("#vocab-types")) $("#vocab-types").innerHTML = TYPES.map((v) => `<span class="tagword">${v}</span>`).join("");
}

function wire() {
  $$(".tab").forEach((t) => t.addEventListener("click", () => switchView(t.dataset.view)));
  $("#make-profile").addEventListener("change", onMakeProfile);
  wireSeg($("#make-match"), (v) => { mk.match = v; scheduleRender(); });
  wireSeg($("#make-mode"), (v) => { mk.mode = v; syncMode(); scheduleRender(); });
  $("#make-count").addEventListener("input", (e) => { $("#count-val").textContent = e.target.value; e.target.setAttribute("aria-valuetext", `${e.target.value} logos`); });
  $("#make-count").addEventListener("change", () => scheduleRender(60));
  $$("[data-clear]").forEach((b) => b.addEventListener("click", () => {
    const w = b.dataset.clear; const set = w === "industry" ? mk.industries : mk.types; set.clear();
    (w === "industry" ? $("#make-industries") : $("#make-types")).querySelectorAll(".pill").forEach((p) => { p.classList.remove("active"); p.setAttribute("aria-pressed", "false"); });
    scheduleRender();
  }));
  // presentation options
  wireSeg($("#opt-layout"), (v) => { mk.layout = v; syncLayout(); scheduleRender(60); });
  wireSeg($("#opt-density"), (v) => { mk.density = v; scheduleRender(60); });
  $("#opt-cols").addEventListener("change", (e) => { mk.columns = e.target.value; scheduleRender(60); });
  $("#opt-cover").addEventListener("change", (e) => { mk.cover = e.target.checked; scheduleRender(60); });
  $("#opt-closing").addEventListener("change", (e) => { mk.closing = e.target.checked; scheduleRender(60); });
  // preview actions
  const dl = $("#preview-download2"); dl.dataset.label = "Download PDF"; dl.addEventListener("click", downloadLive);
  $("#preview-open2").addEventListener("click", () => state.live.url && window.open(state.live.url, "_blank"));
  $("#preview-expand").addEventListener("click", () => state.live.bytes && openModal(state.live.bytes, `${$("#make-profile").value}-${mk.mode}.pdf`, "Live preview"));
  // CTA sheen
  $$(".cta").forEach((c) => c.addEventListener("mousemove", (e) => { const r = c.getBoundingClientRect(); c.style.setProperty("--x", `${e.clientX - r.left}px`); c.style.setProperty("--y", `${e.clientY - r.top}px`); }));

  // gallery
  $("#gal-profile").addEventListener("change", loadGallery);
  $("#gal-sort").addEventListener("change", (e) => { gal.sort = e.target.value; renderGallery(); });
  $("#gal-search").addEventListener("input", (e) => { gal.search = e.target.value; renderGallery(); });
  wireSeg($("#gal-match"), (v) => { gal.match = v; renderGallery(); });
  $("#gal-clear").addEventListener("click", clearGalFilters);
  $("#gal-empty-clear").addEventListener("click", clearGalFilters);
  $("#gal-selectall").addEventListener("click", () => {
    sortEntries(gal.entries.filter(galMatch)).forEach((e) => { if (!gal.sel.has(e.file)) { gal.sel.add(e.file); gal.order.push(e.file); } });
    renderGallery();
  });
  $("#gal-clearsel").addEventListener("click", () => { gal.sel.clear(); gal.order = []; renderGallery(); });
  $("#gal-preview").dataset.label = "Preview selection"; $("#gal-preview").addEventListener("click", galPreview);
  wireTrayDrag();

  // modals
  $$("[data-close]").forEach((b) => b.addEventListener("click", closeModal));
  $$("[data-detail-close]").forEach((b) => b.addEventListener("click", closeDetail));
  $$("[data-palette-close]").forEach((b) => b.addEventListener("click", closePalette));

  // folder
  $("#connect-folder").addEventListener("click", connectFolder);
  $("#banner-connect").addEventListener("click", reconnectFolder);
  $("#disconnect-folder").addEventListener("click", disconnectFolder);

  // theme + palette
  $("#theme-toggle").addEventListener("click", () => applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));
  $("#open-palette").addEventListener("click", openPalette);
  $("#palette-input").addEventListener("input", (e) => { palIdx = 0; renderPalette(e.target.value); });

  // templates + guide
  renderGuide();
  $("#dl-template").addEventListener("click", () => downloadText("tags.csv", TAGS_TEMPLATE, "text/csv"));
  $("#dl-theme").addEventListener("click", () => downloadText("theme.json", THEME_TEMPLATE, "application/json"));

  // keyboard
  document.addEventListener("keydown", onKey);
  syncMode(); syncLayout(); renderRecents();
}
function clearGalFilters() {
  gal.industries.clear(); gal.types.clear(); gal.search = ""; $("#gal-search").value = "";
  $$("#gal-industries .pill, #gal-types .pill").forEach((p) => { p.classList.remove("active"); p.setAttribute("aria-pressed", "false"); });
  renderGallery();
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
  if (e.key === "Escape") { if (!$("#preview").hidden) closeModal(); if (!$("#detail").hidden) closeDetail(); return; }
  if (meta && e.key === "Enter") { e.preventDefault(); return downloadLive(); }
  if (meta && e.key.toLowerCase() === "d") { e.preventDefault(); return applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"); }
  if (typing) return;
  if (e.key === "1") switchView("make");
  else if (e.key === "2") switchView("gallery");
  else if (e.key === "3") switchView("settings");
  else if (e.key === "/") { const s = $("#gal-search"); if (!$("#view-gallery").hidden) { e.preventDefault(); s.focus(); } }
}

async function init() {
  initTheme(); wire(); switchView("make");
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
