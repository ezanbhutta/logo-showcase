# Logo Showcase

A small **desktop app** that turns a shared, tagged logo library into polished,
**client-matched PDFs** — without anyone touching a terminal.

- **You (admin)** keep the logo library in one **Google Drive** folder.
- **Each teammate** installs the app, points it at their Google Drive folder
  **once**, then just picks a profile, filters, and clicks to get a client PDF.
- When you add logos in Drive, everyone sees them automatically.

The app runs locally and opens in the browser. Nothing is uploaded anywhere;
PDFs stay on the teammate's computer.

---

## For teammates — install & use (Windows)

1. **Install Google Drive for Desktop** and sign in, so the shared *Logo
   Library* folder syncs to your PC (it shows up as a drive, often `G:`).
2. **Download `LogoShowcase.exe`** (your admin sends the link) and double-click
   it. A browser tab opens automatically.
3. First time only: go to **Settings → Logo library folder**, paste the path to
   the shared Drive folder (e.g. `G:\My Drive\Logo Library`), and **Save**.
4. Use it:
   - **Make a PDF** — pick a profile, tick industries/types, choose *Slice*
     (the client file) or *Range sheet* (shows breadth), click **Generate PDF**,
     then **Download**.
   - **Browse gallery** — scroll the logos, filter/search, click to select
     several, then **Make PDF from selection**.

That's it. No Python, no terminal, no installs beyond the two downloads above.

---

## For the admin — manage the library

The library is just a folder in Google Drive, one sub-folder per **profile**
(each profile is a different "studio" look):

```
Logo Library/                 ← share this folder with the team
├── storm/
│   ├── logos/                 ← master images (PNG, transparent, ≥1200px)
│   │   ├── apex-builders.png
│   │   └── greenleaf.png
│   ├── tags.csv               ← labels for each logo (the join key is the filename)
│   └── theme.json             ← this profile's colours, fonts, layout
├── eikon/
│   └── …
```

**Adding a logo:** drop the PNG into `logos/`, add one row to `tags.csv`. Done —
it syncs to everyone.

### `tags.csv` columns

| Column | Required | Notes |
|---|---|---|
| `file` | yes | Filename in `logos/`. The join key. |
| `name` | yes | Display name shown on the tile. |
| `industries` | yes | One or more, `\|`-separated. From the controlled list. |
| `types` | yes | One or more, `\|`-separated. From the controlled list. |
| `tier` | yes | 1–5 ranking. **1 = flagship**, 5 = filler. Best are shown first. |
| `year` | no | Tie-breaker (newer first). |
| `active` | no | `false` hides it everywhere. Defaults to `true`. |
| `notes` | no | Free text, ignored by the app. |

Values must come from the controlled vocabulary in `engine/vocab.py` (the app
**rejects unknown values** so you never get `construction` vs `Construction`
drift). `monogram` is accepted as an alias of `lettermark`.

**Industries:** construction, real-estate, architecture-interior,
finance-banking, insurance, technology-saas, ai-data, ecommerce-retail,
fashion-apparel, beauty-cosmetics, health-medical, fitness-wellness,
food-beverage, hospitality-travel, education, professional-services, legal,
marketing-agency, logistics-transport, automotive, industrial-manufacturing,
energy, marine, agriculture, kids, sports, media-entertainment, nonprofit

**Types:** wordmark, lettermark, pictorial, abstract, mascot, combination, emblem

### Themes

Each profile's `theme.json` controls its palette, fonts, layout, and labels, so
two profiles never look related. The two demo profiles show the range: **Storm**
(dark/orange, 3-column) and **Eikon** (violet, 4-column, compact).

---

## How to produce `LogoShowcase.exe`

You build the `.exe` once, then share that single file with the team.

**Easiest — let GitHub build it (no Windows needed):**
1. In the repo on GitHub, open the **Actions** tab.
2. Run **“Build Windows app”** (or push a tag like `v1.0.0`).
3. Download `LogoShowcase.exe` from the run's **Artifacts** (a tagged build also
   attaches it to a **Release** for a clean download link).

**Or build it yourself on a Windows machine:**
```
build_exe.bat
```
→ produces `dist\LogoShowcase.exe`.

---

## For developers

```bash
pip install -r requirements.txt    # reportlab, Pillow, Flask — all pure-Python, no system libs
python run_app.py                  # starts the app, opens the browser
python -m pytest -q                # 13 tests
```

There's also a command-line interface for power users / automation:
```bash
python -m engine.showcase --profile storm --industry construction --mode slice
```

### Project layout

```
engine/            the motor (no UI)
  vocab.py         controlled industry/type vocabulary
  library.py       load + validate tags.csv
  curate.py        filter + rank → best N
  images.py        screen-res previews, hash-cached
  theme.py         load/validate theme.json
  render_common.py shared ReportLab helpers (fonts, colour, layout)
  render_slice.py  matched slice PDF (client deliverable)
  render_range.py  range sheet PDF
  build_gallery.py manifest builder (also a standalone static gallery)
  service.py       high-level ops shared by web + CLI
  config.py        saved library folder + output folder (per-user)
  showcase.py      CLI entrypoint
webapp/            Flask UI (templates + static + routes)
run_app.py         launcher (starts server, opens browser)
LogoShowcase.spec  PyInstaller recipe → single .exe
fonts/             embedded fonts (Archivo, Spectral)
profiles/          demo library (storm, eikon)
```

**Why ReportLab (not WeasyPrint):** the PDF renderer is pure Python with no
system libraries, so the whole app bundles into one `.exe` that installs
nothing. That's what makes the no-terminal, double-click experience possible.

---

## Notes

- **Nothing leaves the computer.** The app is local; the only network piece is
  Google Drive's own syncing of the library folder.
- **PDFs stay the client-facing channel.** The gallery is internal; don't share
  it or any off-platform link in a Fiverr delivery.
- Each teammate's library path and output folder are saved per-user, so app
  updates don't reset them.
