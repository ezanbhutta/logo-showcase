// Baked-in studio identities. The app matches a linked folder named
// "<Studio> Portfolio" to one of these by id, so no theme.json is needed
// in the folder and there is no studio dropdown.

export const THEMES = {
  "abdul-haseeb": {
    "id": "abdul-haseeb",
    "name": "Abdul Haseeb",
    "sort_primary": "industry",
    "palette": {
      "ink": "#14181F",
      "paper": "#FFFFFF",
      "accent": "#C9A24B",
      "accent_soft": "#F4ECDB",
      "muted": "#7B8290",
      "cover_bg": "#0E1320",
      "cover_fg": "#F4EFE3"
    },
    "fonts": {
      "display": "Fraunces",
      "body": "DMSans",
      "serif": "Fraunces"
    },
    "layout": {
      "cover_style": "serif",
      "tile_cols": 3,
      "tile_radius_mm": 2,
      "density": "comfortable"
    },
    "labels": {
      "slice_kicker": "Signature work",
      "range_title": "Portfolio"
    }
  },
  "alee-studioz": {
    "id": "alee-studioz",
    "name": "Alee Studioz",
    "sort_primary": "type",
    "palette": {
      "ink": "#141019",
      "paper": "#FFFFFF",
      "accent": "#8B5CF6",
      "accent_soft": "#EFE8FE",
      "muted": "#79748A",
      "cover_bg": "#141019",
      "cover_fg": "#F4EEFF"
    },
    "fonts": {
      "display": "Syne",
      "body": "Sora",
      "serif": "Fraunces"
    },
    "layout": {
      "cover_style": "bold",
      "tile_cols": 3,
      "tile_radius_mm": 5,
      "density": "comfortable"
    },
    "labels": {
      "slice_kicker": "Selected work",
      "range_title": "Studio range"
    }
  },
  "bic": {
    "id": "bic",
    "name": "BIC",
    "sort_primary": "type",
    "palette": {
      "ink": "#111111",
      "paper": "#FFFFFF",
      "accent": "#111111",
      "accent_soft": "#ECECEC",
      "muted": "#9A9A9A",
      "cover_bg": "#FFFFFF",
      "cover_fg": "#111111"
    },
    "fonts": {
      "display": "Archivo",
      "body": "Archivo",
      "serif": "Spectral"
    },
    "layout": {
      "cover_style": "minimal",
      "tile_cols": 4,
      "tile_radius_mm": 1,
      "density": "compact"
    },
    "labels": {
      "slice_kicker": "Index",
      "range_title": "Index"
    }
  },
  "carpicon": {
    "id": "carpicon",
    "name": "Carpicon",
    "sort_primary": "industry",
    "palette": {
      "ink": "#2B2118",
      "paper": "#FBF7F0",
      "accent": "#B6552F",
      "accent_soft": "#F0E4D6",
      "muted": "#8A7B68",
      "cover_bg": "#2B2118",
      "cover_fg": "#FBF7F0"
    },
    "fonts": {
      "display": "Fraunces",
      "body": "DMSans",
      "serif": "Fraunces"
    },
    "layout": {
      "cover_style": "serif",
      "tile_cols": 3,
      "tile_radius_mm": 3,
      "density": "comfortable"
    },
    "labels": {
      "slice_kicker": "Selected craft",
      "range_title": "The collection"
    }
  },
  "dygram": {
    "id": "dygram",
    "name": "Dygram Design",
    "sort_primary": "type",
    "palette": {
      "ink": "#11161C",
      "paper": "#FFFFFF",
      "accent": "#1F6FEB",
      "accent_soft": "#E6EFFE",
      "muted": "#64748B",
      "cover_bg": "#0E1B2E",
      "cover_fg": "#EAF2FF"
    },
    "fonts": {
      "display": "SpaceGrotesk",
      "body": "DMSans",
      "serif": "Spectral"
    },
    "layout": {
      "cover_style": "gridlines",
      "tile_cols": 4,
      "tile_radius_mm": 2,
      "density": "compact"
    },
    "labels": {
      "slice_kicker": "Selected systems",
      "range_title": "System range"
    }
  },
  "eikon": {
    "id": "eikon",
    "name": "Eikon Design",
    "sort_primary": "type",
    "palette": {
      "ink": "#101114",
      "paper": "#FBFBFD",
      "accent": "#6C5CE7",
      "accent_soft": "#ECE9FB",
      "muted": "#8A8F9A",
      "cover_bg": "#101114",
      "cover_fg": "#F4F2FF"
    },
    "fonts": {
      "display": "Fraunces",
      "body": "DMSans",
      "serif": "Spectral"
    },
    "layout": {
      "cover_style": "editorial",
      "tile_cols": 4,
      "tile_radius_mm": 6,
      "density": "compact"
    },
    "labels": {
      "slice_kicker": "Selected marks",
      "range_title": "Studio range"
    }
  },
  "grid": {
    "id": "grid",
    "name": "Grid Design",
    "sort_primary": "industry",
    "palette": {
      "ink": "#141414",
      "paper": "#FFFFFF",
      "accent": "#E5322B",
      "accent_soft": "#FBE2E1",
      "muted": "#7A7A7A",
      "cover_bg": "#141414",
      "cover_fg": "#FFFFFF"
    },
    "fonts": {
      "display": "Archivo",
      "body": "DMSans",
      "serif": "Spectral"
    },
    "layout": {
      "cover_style": "gridlines",
      "tile_cols": 4,
      "tile_radius_mm": 1,
      "density": "compact"
    },
    "labels": {
      "slice_kicker": "Selected work",
      "range_title": "Full range"
    }
  },
  "storm": {
    "id": "storm",
    "name": "Storm Design",
    "sort_primary": "industry",
    "palette": {
      "ink": "#15181E",
      "paper": "#FFFFFF",
      "accent": "#E2683C",
      "accent_soft": "#FBEDE6",
      "muted": "#6B7280",
      "cover_bg": "#15181E",
      "cover_fg": "#FFFFFF"
    },
    "fonts": {
      "display": "Archivo",
      "body": "Archivo",
      "serif": "Spectral"
    },
    "layout": {
      "cover_style": "editorial",
      "tile_cols": 3,
      "tile_radius_mm": 3,
      "density": "comfortable"
    },
    "labels": {
      "slice_kicker": "Selected work",
      "range_title": "Full range"
    }
  },
  "wedesign": {
    "id": "wedesign",
    "name": "WeDesign",
    "sort_primary": "type",
    "palette": {
      "ink": "#1A1530",
      "paper": "#FFFFFF",
      "accent": "#F0457E",
      "accent_soft": "#FDE3ED",
      "muted": "#7A7490",
      "cover_bg": "#2A1145",
      "cover_fg": "#FFFFFF"
    },
    "fonts": {
      "display": "Sora",
      "body": "Sora",
      "serif": "Spectral"
    },
    "layout": {
      "cover_style": "bold",
      "tile_cols": 3,
      "tile_radius_mm": 6,
      "density": "comfortable"
    },
    "labels": {
      "slice_kicker": "Selected work",
      "range_title": "Everything we do"
    }
  },
  "xstudioz": {
    "id": "xstudioz",
    "name": "XStudioz",
    "sort_primary": "type",
    "palette": {
      "ink": "#0B0B0F",
      "paper": "#FFFFFF",
      "accent": "#6E56F8",
      "accent_soft": "#ECE9FE",
      "muted": "#71717A",
      "cover_bg": "#0B0B0F",
      "cover_fg": "#F6F5FF"
    },
    "fonts": {
      "display": "Syne",
      "body": "Sora",
      "serif": "Fraunces"
    },
    "layout": {
      "cover_style": "bold",
      "tile_cols": 3,
      "tile_radius_mm": 4,
      "density": "comfortable"
    },
    "labels": {
      "slice_kicker": "Selected work",
      "range_title": "Full range"
    }
  }
};

const DEFAULT = {
  id: "studio", name: "Studio", sort_primary: "industry",
  palette: { ink: "#160A33", paper: "#FFFFFF", accent: "#7229FF", accent_soft: "#F1EBFF",
    muted: "#6B7280", cover_bg: "#160A33", cover_fg: "#FFFFFF" },
  fonts: { display: "SpaceGrotesk", body: "Inter", serif: "Spectral" },
  layout: { cover_style: "editorial", tile_cols: 3, tile_radius_mm: 3, density: "comfortable" },
  labels: { slice_kicker: "Selected work", range_title: "Full range" },
};

// "Storm Design Portfolio" / "storm-portfolio" / "Storm" -> the storm theme.
export function detectProfile(folderName) {
  const raw = String(folderName || "").trim();
  const cleaned = raw.replace(/portfolio/ig, "").trim();
  const slug = cleaned.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  // exact id match
  if (THEMES[slug]) return { id: slug, theme: THEMES[slug] };
  // match by theme display name (e.g. "Abdul Haseeb")
  for (const [id, t] of Object.entries(THEMES)) {
    const nameSlug = t.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (nameSlug === slug || slug.startsWith(nameSlug) || nameSlug.startsWith(slug)) return { id, theme: t };
  }
  // no match: default theme, named after the folder
  const name = cleaned || "Studio";
  return { id: slug || "studio", theme: { ...DEFAULT, id: slug || "studio", name } };
}
