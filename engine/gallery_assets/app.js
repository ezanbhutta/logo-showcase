/* Live gallery — reads manifest.json, filters/searches/selects, exports a
   slice command. Vanilla JS, no build step, no backend. Internal tool only. */

(() => {
  "use strict";

  const state = {
    items: [],
    industries: new Set(),
    types: new Set(),
    matchMode: "any",
    search: "",
    selected: new Set(),
    profile: "",
  };

  const $ = (sel) => document.querySelector(sel);
  const grid = $("#grid");

  function applyPalette(palette) {
    if (!palette) return;
    const root = document.documentElement.style;
    if (palette.ink) root.setProperty("--ink", palette.ink);
    if (palette.accent) root.setProperty("--accent", palette.accent);
    if (palette.accent_soft) root.setProperty("--accent-soft", palette.accent_soft);
    if (palette.muted) root.setProperty("--muted", palette.muted);
  }

  function chip(label, container, set) {
    const b = document.createElement("button");
    b.className = "chip";
    b.textContent = label.replace(/-/g, " ");
    b.addEventListener("click", () => {
      if (set.has(label)) { set.delete(label); b.classList.remove("active"); }
      else { set.add(label); b.classList.add("active"); }
      render();
    });
    container.appendChild(b);
  }

  function matches(item) {
    const indSel = state.industries, typSel = state.types;
    const indHit = indSel.size === 0 || item.industries.some((i) => indSel.has(i));
    const typHit = typSel.size === 0 || item.types.some((t) => typSel.has(t));
    let pass;
    if (state.matchMode === "all") {
      const indOk = indSel.size === 0 ? true : indHit;
      const typOk = typSel.size === 0 ? true : typHit;
      pass = indOk && typOk;
    } else {
      pass = (indSel.size === 0 && typSel.size === 0) || indHit || typHit;
    }
    if (pass && state.search) {
      pass = item.name.toLowerCase().includes(state.search.toLowerCase());
    }
    return pass;
  }

  function typeLabel(types) {
    return types.slice(0, 2).map((t) =>
      t.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())).join(", ");
  }

  function card(item) {
    const el = document.createElement("div");
    el.className = "card" + (state.selected.has(item.file) ? " selected" : "");
    el.innerHTML = `
      <div class="thumb"><img src="${item.preview}" alt="${item.name}"></div>
      <div class="cap">
        <span class="tier">T${item.tier}</span>
        <div class="nm">${item.name}</div>
        <div class="meta">${typeLabel(item.types)}</div>
      </div>`;
    el.addEventListener("click", () => {
      if (state.selected.has(item.file)) state.selected.delete(item.file);
      else state.selected.add(item.file);
      render();
    });
    return el;
  }

  function render() {
    const visible = state.items.filter(matches);
    grid.innerHTML = "";
    visible.forEach((it) => grid.appendChild(card(it)));
    $("#empty").hidden = visible.length !== 0;
    $("#count-badge").textContent = `${visible.length} / ${state.items.length}`;

    const n = state.selected.size;
    const selbar = $("#selbar");
    selbar.hidden = n === 0;
    $("#sel-count").textContent = `${n} selected`;
  }

  function buildCommand() {
    const files = [...state.selected];
    return (
      `python -m engine.showcase --profile ${state.profile} \\\n` +
      `  --files ${files.join(" ")} \\\n` +
      `  --mode slice --out out/${state.profile}-selection.pdf`
    );
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); }
    catch (_) {
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select();
      document.execCommand("copy"); ta.remove();
    }
  }

  function wire() {
    $("#search").addEventListener("input", (e) => { state.search = e.target.value; render(); });

    document.querySelectorAll(".chip.mode").forEach((b) => {
      b.addEventListener("click", () => {
        document.querySelectorAll(".chip.mode").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        state.matchMode = b.dataset.mode;
        render();
      });
    });

    $("#clear").addEventListener("click", () => {
      state.industries.clear(); state.types.clear(); state.search = "";
      $("#search").value = "";
      document.querySelectorAll("#industry-filters .chip, #type-filters .chip")
        .forEach((c) => c.classList.remove("active"));
      render();
    });

    $("#clear-sel").addEventListener("click", () => { state.selected.clear(); render(); });

    $("#copy").addEventListener("click", () => copyText([...state.selected].join(" ")));

    $("#export").addEventListener("click", () => {
      $("#export-cmd").textContent = buildCommand();
      $("#export-dialog").showModal();
    });
    $("#copy-cmd").addEventListener("click", () => copyText(buildCommand()));
    $("#close-dialog").addEventListener("click", () => $("#export-dialog").close());
  }

  async function init() {
    const res = await fetch("manifest.json");
    const m = await res.json();
    state.items = m.items;
    state.profile = m.profile;
    applyPalette(m.palette);
    $("#profile-name").textContent = m.name || "Gallery";

    const indBox = $("#industry-filters"), typBox = $("#type-filters");
    m.industries.forEach((i) => chip(i, indBox, state.industries));
    m.types.forEach((t) => chip(t, typBox, state.types));

    wire();
    render();
  }

  init();
})();
