/* Gallery page: load a profile's manifest, filter/search/select, then POST the
   selected logo files to /generate to build a slice PDF. */
(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const state = {
    items: [], profile: window.__PROFILE__,
    industries: new Set(), types: new Set(), matchMode: "any",
    search: "", selected: new Set(),
  };

  const grid = $("#grid");

  function typeLabel(types) {
    return types.slice(0, 2)
      .map((t) => t.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()))
      .join(", ");
  }

  function chip(label, container, set) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "chip";
    b.textContent = label.replace(/-/g, " ");
    b.addEventListener("click", () => {
      if (set.has(label)) { set.delete(label); b.classList.remove("active"); }
      else { set.add(label); b.classList.add("active"); }
      render();
    });
    container.appendChild(b);
  }

  function matches(item) {
    const i = state.industries, t = state.types;
    const iHit = i.size === 0 || item.industries.some((x) => i.has(x));
    const tHit = t.size === 0 || item.types.some((x) => t.has(x));
    let pass;
    if (state.matchMode === "all") {
      pass = (i.size === 0 || iHit) && (t.size === 0 || tHit);
    } else {
      pass = (i.size === 0 && t.size === 0) || iHit || tHit;
    }
    if (pass && state.search) pass = item.name.toLowerCase().includes(state.search.toLowerCase());
    return pass;
  }

  function previewUrl(item) {
    return `/preview/${encodeURIComponent(state.profile)}/${encodeURIComponent(item.preview)}`;
  }

  function card(item) {
    const el = document.createElement("div");
    el.className = "lcard" + (state.selected.has(item.file) ? " sel" : "");
    el.innerHTML =
      `<div class="thumb"><img src="${previewUrl(item)}" alt="${item.name}"></div>` +
      `<div class="cap"><span class="tier">T${item.tier}</span>` +
      `<div class="nm">${item.name}</div>` +
      `<div class="mt">${typeLabel(item.types)}</div></div>`;
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

    const n = state.selected.size;
    const bar = $("#selform");
    bar.hidden = n === 0;
    $("#sel-count").textContent = `${n} selected`;
    const inputs = $("#sel-inputs");
    inputs.innerHTML = "";
    state.selected.forEach((f) => {
      const i = document.createElement("input");
      i.type = "hidden"; i.name = "files"; i.value = f;
      inputs.appendChild(i);
    });
  }

  function wire() {
    $("#search").addEventListener("input", (e) => { state.search = e.target.value; render(); });
    document.querySelectorAll(".chip.mode").forEach((b) =>
      b.addEventListener("click", () => {
        document.querySelectorAll(".chip.mode").forEach((x) => x.classList.remove("active"));
        b.classList.add("active"); state.matchMode = b.dataset.mode; render();
      }));
    $("#clear").addEventListener("click", () => {
      state.industries.clear(); state.types.clear(); state.search = "";
      $("#search").value = "";
      document.querySelectorAll("#industry-filters .chip, #type-filters .chip")
        .forEach((c) => c.classList.remove("active"));
      render();
    });
    $("#clear-sel").addEventListener("click", () => { state.selected.clear(); render(); });
    $("#profile-switch").addEventListener("change", (e) => {
      window.location.href = `/gallery/${encodeURIComponent(e.target.value)}`;
    });
  }

  async function init() {
    const res = await fetch(`/api/manifest/${encodeURIComponent(state.profile)}`);
    const m = await res.json();
    if (m.error) { grid.innerHTML = `<p class="hint">${m.error}</p>`; return; }
    state.items = m.items;
    m.industries.forEach((i) => chip(i, $("#industry-filters"), state.industries));
    m.types.forEach((t) => chip(t, $("#type-filters"), state.types));
    wire();
    render();
  }

  init();
})();
