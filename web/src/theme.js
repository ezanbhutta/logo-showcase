// Load + default a profile theme (mirrors engine/theme.py). A partial theme
// still renders because every key falls back.

const PALETTE_DEFAULTS = {
  ink: "#15181E", paper: "#FFFFFF", accent: "#E2683C", accent_soft: "#FBEDE6",
  muted: "#6B7280", cover_bg: "#15181E", cover_fg: "#FFFFFF",
};
const FONT_DEFAULTS = { display: "Archivo", body: "Archivo", serif: "Spectral" };
const LAYOUT_DEFAULTS = { cover_style: "dark", tile_cols: 3, tile_radius_mm: 3, density: "comfortable" };
const LABEL_DEFAULTS = { slice_kicker: "Selected work", range_title: "Full range" };

function merge(defaults, override) {
  const out = { ...defaults };
  if (override && typeof override === "object") {
    for (const [k, v] of Object.entries(override)) if (v != null) out[k] = v;
  }
  return out;
}

export function parseTheme(json, profileName) {
  let data = {};
  try { data = JSON.parse(json); } catch (e) { throw new Error(`theme.json is not valid JSON: ${e.message}`); }
  const sort = String(data.sort_primary || "industry").toLowerCase();
  return {
    id: data.id || profileName,
    name: data.name || profileName,
    sort_primary: sort === "type" ? "type" : "industry",
    palette: merge(PALETTE_DEFAULTS, data.palette),
    fonts: merge(FONT_DEFAULTS, data.fonts),
    layout: merge(LAYOUT_DEFAULTS, data.layout),
    labels: merge(LABEL_DEFAULTS, data.labels),
  };
}
