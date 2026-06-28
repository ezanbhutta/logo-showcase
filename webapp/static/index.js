/* Index page: when the profile changes, load its industries/types so the
   filter checkboxes only show values that actually exist in that profile. */
(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const profileSel = $("#profile");
  const indBox = $("#industries");
  const typBox = $("#types");
  const modeSel = $("#mode");
  const countField = $("#count-field");

  function checkbox(name, value) {
    const id = `${name}-${value}`;
    const label = document.createElement("label");
    label.innerHTML =
      `<input type="checkbox" name="${name}" value="${value}" id="${id}">` +
      `<span>${value.replace(/-/g, " ")}</span>`;
    return label;
  }

  async function loadFilters(profile) {
    indBox.textContent = "Loading…";
    typBox.textContent = "Loading…";
    try {
      const res = await fetch(`/api/manifest/${encodeURIComponent(profile)}`);
      const m = await res.json();
      if (m.error) throw new Error(m.error);
      indBox.innerHTML = "";
      typBox.innerHTML = "";
      (m.industries || []).forEach((i) => indBox.appendChild(checkbox("industry", i)));
      (m.types || []).forEach((t) => typBox.appendChild(checkbox("type", t)));
    } catch (e) {
      indBox.textContent = "Could not load filters.";
      typBox.textContent = "";
    }
  }

  function syncMode() {
    countField.style.display = modeSel.value === "slice" ? "" : "none";
  }

  if (profileSel) {
    profileSel.addEventListener("change", () => loadFilters(profileSel.value));
    modeSel.addEventListener("change", syncMode);
    loadFilters(profileSel.value);
    syncMode();
  }
})();
