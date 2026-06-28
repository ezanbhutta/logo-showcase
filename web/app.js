// App controller — views (Make a PDF / Gallery / Settings), data source
// (local folder via File System Access, or the bundled demo), and download.

import {
  FsSource, FetchSource, saveHandle, loadHandle, clearHandle,
  verifyPermission, fsAccessSupported,
} from "./src/source.js";
import { parseLibrary, activeEntries, matches } from "./src/library.js";
import { parseTheme } from "./src/theme.js";
import { curate, describeQuery, typeLabel } from "./src/curate.js";
import { renderSlice, renderRange } from "./src/pdf.js";

const $ = (s) => document.querySelector(s);
const state = {
  source: new FetchSource("demo"),
  sourceLabel: "Demo logos",
  profiles: new Map(),       // profile -> { entries, theme }
  thumbs: new Map(),         // `${profile}/${file}` -> objectURL
};

// ---- data helpers ----------------------------------------------------------

async function loadProfile(profile) {
  if (state.profiles.has(profile)) return state.profiles.get(profile);
  const [csv, themeJson] = await Promise.all([
    state.source.getText(profile, "tags.csv"),
    state.source.getText(profile, "theme.json"),
  ]);
  const entries = parseLibrary(csv);
  const theme = parseTheme(themeJson, profile);
  const data = { entries, theme };
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
  const blob = await state.source.getBlob(profile, `logos/${file}`);
  const url = URL.createObjectURL(blob);
  state.thumbs.set(key, url);
  return url;
}

function downloadPdf(bytes, filename) {
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function autoName(profile, q, mode) {
  const bits = [profile, mode];
  if (q.industries.length) bits.push(q.industries.join("-"));
  if (q.types.length) bits.push(q.types.join("-"));
  return bits.join("-") + ".pdf";
}

// ---- source switching ------------------------------------------------------

async function useDemo() {
  state.source = new FetchSource("demo");
  state.sourceLabel = "Demo logos";
  await onSourceChanged(true);
}

async function useFolder(handle) {
  state.source = new FsSource(handle);
  state.sourceLabel = handle.name || "Local folder";
  await onSourceChanged(false);
}

async function onSourceChanged(isDemo) {
  state.profiles.clear();
  state.thumbs.forEach((u) => URL.revokeObjectURL(u));
  state.thumbs.clear();
  $("#source-badge").textContent = state.sourceLabel;
  $("#connect-banner").hidden = !isDemo || !fsAccessSupported();
  renderSettings(isDemo);
  await refreshProfiles();
}

async function refreshProfiles() {
  let names = [];
  try { names = await state.source.listProfiles(); }
  catch (e) { console.error(e); }
  for (const sel of ["#make-profile", "#gal-profile"]) {
    const el = $(sel);
    el.innerHTML = names.map((n) => `<option value="${n}">${n}</option>`).join("");
  }
  if (names.length) {
    await onMakeProfile();
    await loadGallery();
  }
}

// ---- view: Make a PDF ------------------------------------------------------

function checkbox(group, value) {
  const l = document.createElement("label");
  l.innerHTML = `<input type="checkbox" value="${value}"><span>${value.replace(/-/g, " ")}</span>`;
  return l;
}

async function onMakeProfile() {
  const profile = $("#make-profile").value;
  if (!profile) return;
  setStatus("");
  try {
    const { entries } = await loadProfile(profile);
    const ind = $("#make-industries"); ind.innerHTML = "";
    const typ = $("#make-types"); typ.innerHTML = "";
    unionValues(entries, "industries").forEach((v) => ind.appendChild(checkbox("industry", v)));
    unionValues(entries, "types").forEach((v) => typ.appendChild(checkbox("type", v)));
  } catch (e) {
    setStatus(e.message, "err");
  }
}

function selectedChecks(container) {
  return [...container.querySelectorAll("input:checked")].map((i) => i.value);
}

function setStatus(msg, kind = "") {
  const el = $("#make-status");
  el.textContent = msg;
  el.className = "status" + (kind ? " " + kind : "");
}

function syncCountField() {
  $("#make-count-field").style.display = $("#make-mode").value === "slice" ? "" : "none";
}

async function onGenerate() {
  const profile = $("#make-profile").value;
  const mode = $("#make-mode").value;
  const match = $("#make-match").value;
  const count = parseInt($("#make-count").value, 10) || 12;
  const industries = selectedChecks($("#make-industries"));
  const types = selectedChecks($("#make-types"));
  const btn = $("#make-generate");
  btn.disabled = true;
  setStatus("Generating…");
  try {
    const { entries, theme } = await loadProfile(profile);
    const q = { industries, types, matchAll: match === "all" };
    const chosen = curate(entries, q, mode === "slice" ? count : null);
    if (!chosen.length) throw new Error(`No logos match [${describeQuery(industries, types, q.matchAll)}].`);
    const bytes = mode === "slice"
      ? await renderSlice(state.source, profile, theme, chosen, q)
      : await renderRange(state.source, profile, theme, chosen, q);
    downloadPdf(bytes, autoName(profile, q, mode));
    setStatus(`✓ ${chosen.length} logos · ${Math.round(bytes.length / 1024)} KB · downloaded`, "ok");
  } catch (e) {
    setStatus(e.message, "err");
  } finally {
    btn.disabled = false;
  }
}

// ---- view: Gallery ---------------------------------------------------------

const gal = { entries: [], theme: null, profile: "", industries: new Set(), types: new Set(), match: "any", search: "", selected: new Set() };

function chip(label, container, set) {
  const b = document.createElement("button");
  b.type = "button"; b.className = "chip"; b.textContent = label.replace(/-/g, " ");
  b.addEventListener("click", () => {
    if (set.has(label)) { set.delete(label); b.classList.remove("active"); }
    else { set.add(label); b.classList.add("active"); }
    renderGallery();
  });
  container.appendChild(b);
}

async function loadGallery() {
  const profile = $("#gal-profile").value;
  if (!profile) return;
  gal.profile = profile;
  gal.industries.clear(); gal.types.clear(); gal.selected.clear(); gal.search = "";
  $("#gal-search").value = "";
  const { entries, theme } = await loadProfile(profile);
  gal.entries = activeEntries(entries);
  gal.theme = theme;
  const ind = $("#gal-industries"); ind.innerHTML = "";
  const typ = $("#gal-types"); typ.innerHTML = "";
  unionValues(entries, "industries").forEach((v) => chip(v, ind, gal.industries));
  unionValues(entries, "types").forEach((v) => chip(v, typ, gal.types));
  await renderGallery();
}

function galMatches(e) {
  const ok = matches(e, [...gal.industries], [...gal.types], gal.match === "all");
  if (!ok) return false;
  if (gal.search) return e.name.toLowerCase().includes(gal.search.toLowerCase());
  return true;
}

async function renderGallery() {
  const grid = $("#gal-grid");
  const visible = gal.entries.filter(galMatches);
  grid.innerHTML = "";
  for (const e of visible) {
    const el = document.createElement("div");
    el.className = "lcard" + (gal.selected.has(e.file) ? " sel" : "");
    el.innerHTML = `<div class="thumb"><img alt="${e.name}"></div>
      <div class="cap"><span class="tier">T${e.tier}</span>
      <div class="nm">${e.name}</div><div class="mt">${typeLabel(e.types)}</div></div>`;
    el.querySelector("img").src = await thumbUrl(gal.profile, e.file);
    el.addEventListener("click", () => {
      if (gal.selected.has(e.file)) gal.selected.delete(e.file);
      else gal.selected.add(e.file);
      renderGallery();
    });
    grid.appendChild(el);
  }
  $("#gal-empty").hidden = visible.length !== 0;
  const n = gal.selected.size;
  $("#gal-selbar").hidden = n === 0;
  $("#gal-selcount").textContent = `${n} selected`;
}

async function galMakePdf() {
  const files = [...gal.selected];
  if (!files.length) return;
  const byFile = new Map(gal.entries.map((e) => [e.file, e]));
  let chosen = files.map((f) => byFile.get(f)).filter(Boolean);
  chosen.sort((a, b) => a.tier - b.tier || (b.year ?? -1) - (a.year ?? -1));
  const q = { industries: [], types: [], matchAll: false };
  const btn = $("#gal-makepdf"); btn.disabled = true; btn.textContent = "Generating…";
  try {
    const bytes = await renderSlice(state.source, gal.profile, gal.theme, chosen, q);
    downloadPdf(bytes, `${gal.profile}-selection.pdf`);
  } catch (e) { alert(e.message); }
  finally { btn.disabled = false; btn.textContent = "Make PDF from selection"; }
}

// ---- view: Settings --------------------------------------------------------

function renderSettings(isDemo) {
  $("#fs-supported").hidden = !fsAccessSupported();
  $("#fs-unsupported").hidden = fsAccessSupported();
  $("#settings-source").textContent = isDemo
    ? "Using the built-in demo logos."
    : `Connected to: ${state.sourceLabel}`;
  $("#disconnect-folder").hidden = isDemo;
}

async function connectFolder() {
  try {
    const handle = await window.showDirectoryPicker({ mode: "read" });
    if (!(await verifyPermission(handle))) return;
    await saveHandle(handle);
    await useFolder(handle);
    switchView("make");
  } catch (e) {
    if (e.name !== "AbortError") alert("Couldn't open that folder: " + e.message);
  }
}

async function disconnectFolder() {
  await clearHandle();
  await useDemo();
}

// ---- view switching + wiring ----------------------------------------------

function switchView(view) {
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === view));
  document.querySelectorAll(".view").forEach((v) => { v.hidden = v.id !== `view-${view}`; });
  if (view === "gallery") loadGallery();
}

function wire() {
  document.querySelectorAll(".tab").forEach((t) =>
    t.addEventListener("click", () => switchView(t.dataset.view)));

  $("#make-profile").addEventListener("change", onMakeProfile);
  $("#make-mode").addEventListener("change", syncCountField);
  $("#make-generate").addEventListener("click", onGenerate);

  $("#gal-profile").addEventListener("change", loadGallery);
  $("#gal-search").addEventListener("input", (e) => { gal.search = e.target.value; renderGallery(); });
  document.querySelectorAll(".chip.mode").forEach((b) =>
    b.addEventListener("click", () => {
      document.querySelectorAll(".chip.mode").forEach((x) => x.classList.remove("active"));
      b.classList.add("active"); gal.match = b.dataset.mode; renderGallery();
    }));
  $("#gal-clear").addEventListener("click", () => {
    gal.industries.clear(); gal.types.clear(); gal.search = ""; $("#gal-search").value = "";
    document.querySelectorAll("#gal-industries .chip, #gal-types .chip").forEach((c) => c.classList.remove("active"));
    renderGallery();
  });
  $("#gal-clearsel").addEventListener("click", () => { gal.selected.clear(); renderGallery(); });
  $("#gal-makepdf").addEventListener("click", galMakePdf);

  $("#connect-folder").addEventListener("click", connectFolder);
  $("#banner-connect").addEventListener("click", connectFolder);
  $("#disconnect-folder").addEventListener("click", disconnectFolder);

  syncCountField();
}

async function init() {
  wire();
  // Try a previously-connected folder.
  if (fsAccessSupported()) {
    try {
      const handle = await loadHandle();
      if (handle && (await handle.queryPermission({ mode: "read" })) === "granted") {
        await useFolder(handle);
        return;
      }
    } catch (e) { /* fall back to demo */ }
  }
  await useDemo();
}

init();
