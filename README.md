# Logo Showcase

Internal tooling that turns a **tagged logo library** into small,
**client-matched PDF slices** — one engine that wears a **different face per
profile** (Storm, Eikon, …).

The library can hold hundreds of logos. It is never sent as one file. The
deliverable is always a small, filtered slice built for a specific client.

> The library is **data**. The PDF is only ever a small, relevant **slice** of
> it. Volume is not the goal — **relevance** is.

See [`SYSTEM.md`](SYSTEM.md) for the full build spec.

---

## One library → three outputs

| Output | Mode | Use |
|---|---|---|
| **Matched slice** (PDF) | `--mode slice` | Default. The logos that fit this client. ~1–2 MB. |
| **Range sheet** (PDF) | `--mode range` | "Show me your range." Dense contact sheet. |
| **Live gallery** (web) | `build_gallery` | Internal. Team browses + picks fast. |

---

## Setup

```bash
pip install -r requirements.txt
```

WeasyPrint needs its native libs (pango, cairo, gdk-pixbuf) — see the
[WeasyPrint install docs](https://doc.courtbouillon.org/weasyprint/stable/first_steps.html)
if rendering fails. The bundled fonts (Archivo, Spectral) live in `fonts/` and
are embedded into every PDF; drop additional per-theme fonts there and the
renderer picks them up by family name automatically.

---

## Usage

```bash
# matched slice for a construction client (Storm profile)
python -m engine.showcase --profile storm --industry construction \
       --mode slice --count 12 --out out/storm-construction.pdf

# by type instead of industry
python -m engine.showcase --profile eikon --type abstract --mode slice

# combine filters: finance AND wordmark
python -m engine.showcase --profile storm --industry finance-banking \
       --type wordmark --match all

# range sheet (whole profile, or filtered the same way)
python -m engine.showcase --profile storm --mode range --out out/storm-range.pdf

# explicit selection (e.g. exported from the gallery)
python -m engine.showcase --profile storm --files apex-builders.png greenleaf.png

# build the static gallery for a profile
python -m engine.build_gallery --profile storm
# then open build/storm/gallery/index.html
```

### Flags

| Flag | Notes |
|---|---|
| `--profile` | **Required.** Which profile's library + theme to use. |
| `--industry` | Filter by industry. Repeatable. |
| `--type` | Filter by logo type. Repeatable. |
| `--match` | `any` (OR, default) or `all` (AND) across supplied filters. |
| `--mode` | `slice` (default) or `range`. |
| `--count` | Cap for slice mode. Default **12**. |
| `--files` | Explicit filenames (overrides filters; keeps tier order). |
| `--out` | Output path. Auto-named under `out/` if omitted. |

---

## How it works

```
Library (data)  →  Engine  →  Output (one of three modes)
per-profile        filter → curate best N →
folders + tags.csv optimize images → apply theme
```

**Pipeline** (per `engine/showcase.py`):

1. **Load** `theme.json` and `tags.csv` for the profile.
2. **Validate** every tag against `engine/vocab.py`; fail loudly on unknown
   values or missing image files.
3. **Filter** rows by the query (`any`/`all`), drop `active = false`.
4. **Curate** → sort by `tier` ascending, then `year` descending, then file
   order; take top `--count`.
5. **Optimize images** → generate/reuse cached screen-res previews
   (hash-cached in `build/`, ≤ 120 KB each).
6. **Render** the chosen mode with the profile theme.
7. **Write** to `out/` and report path + file size.

---

## Repository layout

```
logo-showcase/
├── profiles/
│   ├── storm/                       # one "face"
│   │   ├── logos/                   # master images (source of truth, PNG)
│   │   ├── tags.csv                 # labels (join key = file)
│   │   └── theme.json               # palette, fonts, layout
│   └── eikon/                       # a deliberately different face
├── engine/
│   ├── showcase.py                  # CLI entrypoint
│   ├── library.py                   # load + validate tags.csv
│   ├── curate.py                    # filter + rank → best N
│   ├── images.py                    # screen-res previews + hash cache
│   ├── render_common.py             # shared theme→CSS / font embedding
│   ├── render_slice.py              # matched slice PDF
│   ├── render_range.py              # range sheet PDF
│   ├── build_gallery.py             # static gallery + manifest.json
│   ├── gallery_assets/              # gallery shell (html/css/js)
│   ├── theme.py                     # load/validate theme.json
│   └── vocab.py                     # controlled vocabulary
├── fonts/                           # embedded fonts (Archivo, Spectral)
├── tests/                           # pytest suite
├── build/                           # generated previews + manifests (gitignored)
├── out/                             # generated PDFs (gitignored)
└── SYSTEM.md                        # full spec
```

---

## The library

### Masters

PNG, transparent background preferred, ≥ 1200px on the longest edge. The
filename is the **join key** — `kebab-case`, unique within the profile, and it
must match the `file` column in `tags.csv`. Masters are never embedded
directly; the engine generates optimized previews from them.

### `tags.csv`

One row per logo. UTF-8, comma-separated, header row required.

| Column | Required | Notes |
|---|---|---|
| `file` | yes | Filename in `logos/`. Join key. |
| `name` | yes | Display name on the tile. |
| `industries` | yes | One or more, `\|`-separated. From the industry vocab. |
| `types` | yes | One or more, `\|`-separated. From the type vocab. |
| `tier` | yes | 1–5 curation rank. **1 = flagship**, 5 = filler. |
| `year` | no | Tie-breaker (newer first). |
| `active` | no | `false` hides it everywhere. Defaults to `true`. |
| `notes` | no | Free text, ignored by the engine. |

**Dual-tagging:** a logo can carry multiple industries *and* multiple types,
and surfaces under any query that matches one of its labels. Tag once, slice
infinitely.

### Controlled vocabulary

Values **must** come from the lists in `engine/vocab.py`; the engine errors on
any unknown value (prevents `construction` vs `Construction` drift). The lists
are **extend-only**. `monogram` is accepted as an alias of `lettermark` — add
aliases, not new canonical type values.

---

## Themes — a different face per profile

Each profile carries its own `theme.json` (palette, fonts, layout, labels).
Nothing visual is hard-coded in the renderers; every surface reads from the
theme, so two profiles never read as related. `sort_primary` sets whether a
profile leads by `industry` or `type`.

The two shipped profiles demonstrate the effect: **Storm** is dark/orange,
3-column, sans display; **Eikon** is violet, 4-column, compact, serif display.

---

## Development

```bash
python -m pytest -q      # run the test suite
```

The `build/` and `out/` directories are generated and gitignored.
