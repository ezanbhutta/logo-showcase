# Logo Showcase — Web app (Vercel + local folder)

A static web app, hosted on **Vercel**, that reads your logo library from a
**local folder on each teammate's computer** and builds client PDFs **entirely
in the browser**. Nothing is uploaded — the logos never leave the machine.

## How it can be "hosted online but read a local folder"

A web server (Vercel) **cannot** reach files on someone's PC. What *can* is the
**browser**, via the [File System Access API](https://developer.mozilla.org/docs/Web/API/File_System_Access_API):
the user picks a folder once, and the browser reads it locally. So everything —
reading logos, generating PDFs (with [pdf-lib](https://pdf-lib.js.org/)) — runs
client-side. Vercel only serves the app shell.

**Requirement:** the File System Access API works in **Chrome or Edge on
desktop**. Safari and Firefox can't open a local folder (they can still use the
built-in demo logos).

## Deploy to Vercel

This folder (`web/`) is a static site — no build step.

**Option A — Vercel dashboard (easiest):**
1. Go to <https://vercel.com/new> and import the `ezanbhutta/logo-showcase` repo.
2. Set **Root Directory** to `web`.
3. Framework preset: **Other**. Build command: *(leave empty)*. Output dir: `.`
4. Deploy. You get a URL like `https://logo-showcase.vercel.app`.

**Option B — Vercel CLI:**
```bash
npm i -g vercel
cd web
vercel --prod
```

## Using it (teammates)

1. Install **Google Drive for Desktop** so the shared library folder syncs to
   the PC (shows up as a drive, often `G:`).
2. Open the Vercel URL in **Chrome or Edge**.
3. **Settings → Connect library folder** → pick the synced Drive folder. Done
   once (the choice is remembered).
4. **Make a PDF** (profile + filters → Generate → the PDF downloads) or
   **Browse gallery** (select logos → *Make PDF from selection*).

Until a folder is connected, the app shows the bundled **demo logos** so it
works immediately.

## How the library folder must look

Same structure as the rest of the project — one sub-folder per profile:

```
<your library folder>/
├── storm/
│   ├── logos/*.png
│   ├── tags.csv
│   └── theme.json
└── eikon/ …
```

The admin maintains this in Google Drive; everyone points the app at their
synced copy.

## Files

```
web/
├── index.html        app shell (3 views: Make a PDF / Gallery / Settings)
├── styles.css
├── app.js            controller: views, data source, download
├── src/
│   ├── source.js     File System Access + demo source, handle persistence
│   ├── vocab.js      controlled vocabulary (mirrors engine/vocab.py)
│   ├── csv.js        CSV parser
│   ├── library.js    parse + validate tags.csv
│   ├── curate.js     filter + rank
│   ├── theme.js      theme.json + defaults
│   ├── images.js     in-browser preview downscaling
│   └── pdf.js        client-side PDF (slice + range) via pdf-lib
├── fonts/            Archivo + Spectral (embedded into PDFs)
├── lib/              pdf-lib + fontkit (vendored)
├── demo/             bundled demo library (works with no folder connected)
└── vercel.json
```

The Python engine (`engine/`, `webapp/`, desktop `.exe`) still exists for the
offline/desktop route; this `web/` app is the hosted, zero-install version.
