// App controller: studios, personalisation, filters, live PDF preview, recents.
import {
  FsSource, FetchSource, saveHandle, loadHandle, clearHandle,
  verifyPermission, fsAccessSupported,
} from "./src/source.js";
import { parseLibrary, activeEntries, matches } from "./src/library.js";
import { parseTheme } from "./src/theme.js";
import { curate, describeQuery, typeLabel, titleCase } from "./src/curate.js";
import { renderSlice, renderRange } from "./src/pdf.js";
import { INDUSTRIES, TYPES } from "./src/vocab.js";

const LAST_PROFILE = "ls-last-profile";

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const state = {
  source: new FetchSource("demo"),
  sourceLabel: "Demo logos",
  isDemo: true,
  profiles: new Map(),   // profile -> {entries, theme}
  meta: new Map(),       // profile -> theme (light)
  thumbs: new Map(),
  blobUrl: null,
  pendingHandle: null,   // saved folder awaiting a one-click reconnect
};

// ---- data ------------------------------------------------------------------
async function getMeta(profile) {
  if (state.meta.has(profile)) return state.meta.get(profile);
  // theme.json is optional — fall back to a sensible default theme.
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
function unionValues(entries, key) {
  const set = new Set();
  activeEntries(entries).forEach((e) => e[key].forEach((v) => set.add(v)));
  return [...set].sort();
}
async function thumbUrl(profile, file) {
  const key = `${profile}/${file}`;
  if (state.thumbs.has(key)) return state.thumbs.get(key);
  const url = URL.createObjectURL(await state.source.getBlob(profile, `logos/${file}`));
  state.thumbs.set(key, url);
  return url;
}

// ---- generic UI helpers ----------------------------------------------------
function renderPills(container, values, set, onChange) {
  container.innerHTML = "";
  values.forEach((v) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "pill"; b.textContent = v.replace(/-/g, " ");
    if (set.has(v)) b.classList.add("active");
    b.addEventListener("click", () => {
      if (set.has(v)) { set.delete(v); b.classList.remove("active"); }
      else { set.add(v); b.classList.add("active"); }
      onChange && onChange();
    });
    container.appendChild(b);
  });
}
function wireSegmented(el, onPick) {
  el.querySelectorAll(".seg").forEach((b) =>
    b.addEventListener("click", () => {
      el.querySelectorAll(".seg").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      onPick(b.dataset.val);
    }));
}
function downloadBlobUrl(url, filename) {
  const a = document.createElement("a"); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
}

// ---- preview modal ---------------------------------------------------------
function openPreview(bytes, filename, subtitle) {
  if (state.blobUrl) URL.revokeObjectURL(state.blobUrl);
  state.blobUrl = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  $("#preview-title").textContent = filename;
  $("#preview-sub").textContent = `${subtitle} · ${Math.round(bytes.length / 1024)} KB`;
  const frame = $("#preview-frame");
  $("#preview-loading").hidden = false; frame.hidden = true;
  frame.onload = () => { $("#preview-loading").hidden = true; frame.hidden = false; };
  frame.src = state.blobUrl + "#toolbar=1&view=FitH";
  setTimeout(() => { $("#preview-loading").hidden = true; frame.hidden = false; }, 1500);
  $("#preview-download").onclick = () => downloadBlobUrl(state.blobUrl, filename);
  $("#preview-open").onclick = () => window.open(state.blobUrl, "_blank");
  $("#preview").hidden = false;
  $("#preview").dataset.filename = filename;
}
function closePreview() {
  $("#preview").hidden = true;
  $("#preview-frame").src = "about:blank";
}

// ---- source switching ------------------------------------------------------
async function useDemo() {
  state.source = new FetchSource("demo"); state.sourceLabel = "Demo logos"; state.isDemo = true;
  await onSourceChanged();
}
async function useFolder(handle) {
  state.source = new FsSource(handle); state.sourceLabel = handle.name || "Local folder"; state.isDemo = false;
  await onSourceChanged();
}
async function onSourceChanged() {
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
    $(sel).innerHTML = opts.map(([v, label]) => `<option value="${v}">${label}</option>`).join("");
  }

  const empty = $("#no-studios");
  if (!names.length) {
    empty.hidden = false;
    empty.innerHTML = state.isDemo
      ? "No demo studios available."
      : `No studios found in <b>${state.sourceLabel}</b>. Each studio needs its own sub-folder `
        + `containing a <code>tags.csv</code> file (<code>theme.json</code> is optional). `
        + `<button class="link" id="goto-guide">See how to organise your folder →</button>`
        + (err ? `<br><small class="muted">${err.message}</small>` : "");
    const g = document.getElementById("goto-guide");
    if (g) g.addEventListener("click", () => switchView("settings"));
    return;
  }
  empty.hidden = true;

  // Restore the previously selected studio so it stays selected across reloads.
  const last = localStorage.getItem(LAST_PROFILE);
  if (last && names.includes(last)) { $("#make-profile").value = last; $("#gal-profile").value = last; }
  await onMakeProfile();
  await loadGallery();
}

// ---- Create view -----------------------------------------------------------
const mk = { industries: new Set(), types: new Set(), match: "any", mode: "slice" };

async function onMakeProfile() {
  const profile = $("#make-profile").value;
  if (!profile) return;
  localStorage.setItem(LAST_PROFILE, profile);
  setStatus("");
  mk.industries.clear(); mk.types.clear();
  try {
    const { entries } = await loadProfile(profile);
    renderPills($("#make-industries"), unionValues(entries, "industries"), mk.industries);
    renderPills($("#make-types"), unionValues(entries, "types"), mk.types);
    const t = await getMeta(profile);
    const sw = $("#make-swatches"); sw.innerHTML = "";
    [t.palette.cover_bg, t.palette.accent, t.palette.ink, t.palette.paper].forEach((c) => {
      const s = document.createElement("span"); s.style.background = c; sw.appendChild(s);
    });
  } catch (e) { setStatus(e.message, "err"); }
}
function setStatus(msg, kind = "") {
  const el = $("#make-status"); el.textContent = msg; el.className = "status" + (kind ? " " + kind : "");
}
function setBusy(btn, busy) {
  btn.disabled = busy;
  btn.querySelector(".cta-label").textContent = busy ? "Designing…" : btn.dataset.label;
  btn.querySelector(".cta-spin").hidden = !busy;
}

async function onGenerate() {
  const profile = $("#make-profile").value;
  const btn = $("#make-generate");
  setBusy(btn, true); setStatus("");
  try {
    const { entries, theme } = await loadProfile(profile);
    const q = { industries: [...mk.industries], types: [...mk.types], matchAll: mk.match === "all" };
    const count = parseInt($("#make-count").value, 10) || 12;
    const chosen = curate(entries, q, mk.mode === "slice" ? count : null);
    if (!chosen.length) throw new Error(`No logos match [${describeQuery(q.industries, q.types, q.matchAll)}].`);
    const opts = { dateStr: defaultDate() };
    const bytes = mk.mode === "slice"
      ? await renderSlice(state.source, profile, theme, chosen, q, opts)
      : await renderRange(state.source, profile, theme, chosen, q, opts);
    openPreview(bytes, `${profile}-${mk.mode}.pdf`, `${theme.name} · ${chosen.length} marks`);
    pushRecent({ profile, name: theme.name, mode: mk.mode,
      industries: q.industries, types: q.types, match: mk.match, count });
    setStatus("✓ Preview ready", "ok");
  } catch (e) { setStatus(e.message, "err"); }
  finally { setBusy(btn, false); }
}
function slug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }

// ---- Recent ----------------------------------------------------------------
function loadRecents() { try { return JSON.parse(localStorage.getItem("ls-recents") || "[]"); } catch { return []; } }
function pushRecent(r) {
  let list = loadRecents().filter((x) => JSON.stringify({ ...x, ts: 0 }) !== JSON.stringify({ ...r, ts: 0 }));
  list.unshift({ ...r, ts: Date.now() });
  list = list.slice(0, 6);
  localStorage.setItem("ls-recents", JSON.stringify(list));
  renderRecents();
}
function renderRecents() {
  const list = loadRecents();
  $("#recent-wrap").hidden = list.length === 0;
  const wrap = $("#recent-list"); wrap.innerHTML = "";
  list.forEach((r) => {
    const b = document.createElement("button");
    b.className = "chip-recent";
    const scope = [...(r.industries || []), ...(r.types || [])].slice(0, 2).join(", ") || "all";
    b.innerHTML = `<b>${r.name}</b> · ${r.mode}${r.client ? " · " + r.client : ""} · ${scope}`;
    b.addEventListener("click", () => applyRecent(r));
    wrap.appendChild(b);
  });
}
async function applyRecent(r) {
  $("#make-profile").value = r.profile;
  await onMakeProfile();
  (r.industries || []).forEach((v) => togglePill($("#make-industries"), v, mk.industries, true));
  (r.types || []).forEach((v) => togglePill($("#make-types"), v, mk.types, true));
  setSegmented($("#make-match"), r.match || "any"); mk.match = r.match || "any";
  setSegmented($("#make-mode"), r.mode || "slice"); mk.mode = r.mode || "slice"; syncMode();
  if (r.count) { $("#make-count").value = r.count; $("#count-val").textContent = r.count; }
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function togglePill(container, value, set, on) {
  const btn = [...container.querySelectorAll(".pill")].find((b) => b.textContent === value.replace(/-/g, " "));
  if (btn) { btn.classList.toggle("active", on); if (on) set.add(value); else set.delete(value); }
}
function setSegmented(el, val) {
  el.querySelectorAll(".seg").forEach((b) => b.classList.toggle("active", b.dataset.val === val));
}
function syncMode() { $("#make-count-row").style.display = mk.mode === "slice" ? "" : "none"; }

// ---- Gallery ---------------------------------------------------------------
const gal = { entries: [], theme: null, profile: "", industries: new Set(), types: new Set(), match: "any", search: "", selected: new Set() };

async function loadGallery() {
  const profile = $("#gal-profile").value;
  if (!profile) return;
  localStorage.setItem(LAST_PROFILE, profile);
  gal.profile = profile; gal.industries.clear(); gal.types.clear(); gal.selected.clear(); gal.search = "";
  $("#gal-search").value = "";
  const { entries, theme } = await loadProfile(profile);
  gal.entries = activeEntries(entries); gal.theme = theme;
  renderPills($("#gal-industries"), unionValues(entries, "industries"), gal.industries, renderGallery);
  renderPills($("#gal-types"), unionValues(entries, "types"), gal.types, renderGallery);
  await renderGallery();
}
function galMatches(e) {
  if (!matches(e, [...gal.industries], [...gal.types], gal.match === "all")) return false;
  return !gal.search || e.name.toLowerCase().includes(gal.search.toLowerCase());
}
async function renderGallery() {
  const grid = $("#gal-grid");
  const visible = gal.entries.filter(galMatches);
  grid.innerHTML = "";
  for (const e of visible) {
    const el = document.createElement("div");
    el.className = "lcard" + (gal.selected.has(e.file) ? " sel" : "");
    el.innerHTML = `<div class="thumb"><img alt="${e.name}"></div>
      <div class="cap"><span class="tier">T${e.tier}</span><span class="nm">${e.name}</span><span class="mt">${typeLabel(e.types)}</span></div>`;
    el.querySelector("img").src = await thumbUrl(gal.profile, e.file);
    el.addEventListener("click", () => {
      if (gal.selected.has(e.file)) gal.selected.delete(e.file); else gal.selected.add(e.file);
      renderGallery();
    });
    grid.appendChild(el);
  }
  $("#gal-empty").hidden = visible.length !== 0;
  const n = gal.selected.size;
  $("#gal-selbar").hidden = n === 0;
  $("#gal-selcount").textContent = `${n} selected`;
}
async function galPreview() {
  const files = [...gal.selected]; if (!files.length) return;
  const byFile = new Map(gal.entries.map((e) => [e.file, e]));
  const chosen = files.map((f) => byFile.get(f)).filter(Boolean)
    .sort((a, b) => a.tier - b.tier || (b.year ?? -1) - (a.year ?? -1));
  const btn = $("#gal-preview"); setBusy(btn, true);
  try {
    const q = { industries: [], types: [], matchAll: false };
    const bytes = await renderSlice(state.source, gal.profile, gal.theme, chosen, q, { dateStr: defaultDate() });
    openPreview(bytes, `${gal.profile}-selection.pdf`, `${gal.theme.name} · ${chosen.length} marks`);
  } catch (e) { setStatus(e.message, "err"); alert(e.message); }
  finally { setBusy(btn, false); }
}

// ---- Settings --------------------------------------------------------------
function renderSettings() {
  $("#fs-supported").hidden = !fsAccessSupported();
  $("#fs-unsupported").hidden = fsAccessSupported();
  $("#settings-source").textContent = state.isDemo ? "Using the built-in demo logos." : `Connected to: ${state.sourceLabel}`;
  $("#disconnect-folder").hidden = state.isDemo;
}
async function connectFolder() {
  try {
    const handle = await window.showDirectoryPicker({ mode: "read" });
    if (!(await verifyPermission(handle))) return;
    state.pendingHandle = null;
    await saveHandle(handle); await useFolder(handle); switchView("make");
  } catch (e) { if (e.name !== "AbortError") alert("Couldn't open that folder: " + e.message); }
}
async function disconnectFolder() { state.pendingHandle = null; await clearHandle(); await useDemo(); }

// A folder was attached before but the browser needs one click to re-grant
// read access (it can't silently reopen local files). One click restores it.
async function reconnectFolder() {
  const h = state.pendingHandle;
  if (!h) return connectFolder();
  if (await verifyPermission(h)) {
    state.pendingHandle = null;
    await saveHandle(h); await useFolder(h); switchView("make");
  }
}
function showReconnectBanner() {
  const name = state.pendingHandle?.name || "your library folder";
  $("#banner-text").innerHTML = `Library folder <strong>${name}</strong> is saved — reconnect to continue.`;
  $("#banner-connect").textContent = "Reconnect →";
  $("#connect-banner").hidden = false;
}

// ---- view switching --------------------------------------------------------
function switchView(view) {
  $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === view));
  $$(".view").forEach((v) => { v.hidden = v.id !== `view-${view}`; });
  if (view === "gallery") loadGallery();
}
function defaultDate() {
  const d = new Date();
  return d.toLocaleString("en-US", { month: "long", year: "numeric" });
}

function wire() {
  $$(".tab").forEach((t) => t.addEventListener("click", () => switchView(t.dataset.view)));
  $("#make-profile").addEventListener("change", onMakeProfile);
  wireSegmented($("#make-match"), (v) => (mk.match = v));
  wireSegmented($("#make-mode"), (v) => { mk.mode = v; syncMode(); });
  $("#make-count").addEventListener("input", (e) => $("#count-val").textContent = e.target.value);
  $$("[data-clear]").forEach((b) => b.addEventListener("click", () => {
    const which = b.dataset.clear;
    const set = which === "industry" ? mk.industries : mk.types;
    set.clear();
    (which === "industry" ? $("#make-industries") : $("#make-types"))
      .querySelectorAll(".pill").forEach((p) => p.classList.remove("active"));
  }));
  const gen = $("#make-generate"); gen.dataset.label = "Generate preview";
  gen.addEventListener("click", onGenerate);

  $("#gal-profile").addEventListener("change", loadGallery);
  $("#gal-search").addEventListener("input", (e) => { gal.search = e.target.value; renderGallery(); });
  wireSegmented($("#gal-match"), (v) => { gal.match = v; renderGallery(); });
  $("#gal-clear").addEventListener("click", () => {
    gal.industries.clear(); gal.types.clear(); gal.search = ""; $("#gal-search").value = "";
    $$("#gal-industries .pill, #gal-types .pill").forEach((p) => p.classList.remove("active"));
    renderGallery();
  });
  $("#gal-clearsel").addEventListener("click", () => { gal.selected.clear(); renderGallery(); });
  const gp = $("#gal-preview"); gp.dataset.label = "Preview selection";
  gp.addEventListener("click", galPreview);

  $("#connect-folder").addEventListener("click", connectFolder);
  $("#banner-connect").addEventListener("click", reconnectFolder);
  $("#disconnect-folder").addEventListener("click", disconnectFolder);

  $$("[data-close]").forEach((b) => b.addEventListener("click", closePreview));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#preview").hidden) closePreview(); });

  renderGuide();
  $("#dl-template").addEventListener("click", () => downloadText("tags.csv", TAGS_TEMPLATE, "text/csv"));
  $("#dl-theme").addEventListener("click", () => downloadText("theme.json", THEME_TEMPLATE, "application/json"));

  syncMode();
  renderRecents();
}

// ---- library guide ---------------------------------------------------------
const TAGS_TEMPLATE = `file,name,industries,types,tier,year,active,notes
example-logo.png,Example Brand,construction|real-estate,combination,1,2025,true,first row is the header
another-mark.png,Another Mark,finance-banking,wordmark,2,2024,true,
`;
const THEME_TEMPLATE = JSON.stringify({
  id: "my-studio", name: "My Studio", sort_primary: "industry",
  palette: { ink: "#15181E", paper: "#FFFFFF", accent: "#7229FF", accent_soft: "#F1EBFF",
    muted: "#6B7280", cover_bg: "#15181E", cover_fg: "#FFFFFF" },
  fonts: { display: "Archivo", body: "Archivo", serif: "Spectral" },
  layout: { cover_style: "editorial", tile_cols: 3, tile_radius_mm: 3, density: "comfortable" },
  labels: { slice_kicker: "Selected work", range_title: "Full range" },
}, null, 2);

function renderGuide() {
  const ind = $("#vocab-industries"), typ = $("#vocab-types");
  if (ind) ind.innerHTML = INDUSTRIES.map((v) => `<span class="tagword">${v}</span>`).join("");
  if (typ) typ.innerHTML = TYPES.map((v) => `<span class="tagword">${v}</span>`).join("");
}
function downloadText(filename, text, mime) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a"); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function init() {
  wire();
  if (fsAccessSupported()) {
    try {
      const handle = await loadHandle();
      if (handle) {
        const perm = await handle.queryPermission({ mode: "read" });
        if (perm === "granted") { await useFolder(handle); return; }
        // Saved but needs a click to re-grant — keep it and offer reconnect.
        state.pendingHandle = handle;
        await useDemo();
        showReconnectBanner();
        return;
      }
    } catch (e) { /* fall through to demo */ }
  }
  await useDemo();
}
init();
