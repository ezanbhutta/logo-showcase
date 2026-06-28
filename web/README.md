# Logo Showcase — Web app (Vercel + local portfolio folder)

A static web app, hosted on **Vercel**, that reads a studio's **portfolio folder
on the local computer** and turns it into client-ready deliverables — entirely
in the browser. Nothing is uploaded.

## The model

Each studio links **one folder, once**, named `<Studio> Portfolio` (e.g.
`Storm Portfolio`). The app **detects the studio from the folder name** and
applies its identity — **no dropdown**. Inside are deliverable-type folders;
files are named by brand:

```
Storm Portfolio/            ← link once · name = "<Studio> Portfolio"
├── Logos/                  Apex Builders-Logotype.png   (png · jpg · pdf)
├── Brand Guidelines/       Apex Builders-Brand Guidelines.pdf
├── Social Media Kit/       Apex Builders.png
├── Stationery/             Apex Builders.pdf
└── Logo Animation/         Apex Builders.mp4 / .gif
```

- **Logos** → a themed **showcase**: pick the marks, preview a PDF deck live,
  download. PNG/JPG render in the deck; PDF/SVG are listed and downloadable.
- **Brand Guidelines / Social Media Kit / Stationery / Logo Animation** →
  **search → preview → download → share** with the client.

The studio identity (palette, fonts, cover style) is **baked into the app** for
the ten studios (XStudioz, Storm, Dygram, Carpicon, WeDesign, BIC, Abdul Haseeb,
Alee Studioz, Eikon, Grid); the folder name picks one. An unrecognised name gets
a clean default theme named after the folder.

## How it reads a local folder from a hosted site

A web server can't reach files on a PC; the **browser** can, via the
[File System Access API](https://developer.mozilla.org/docs/Web/API/File_System_Access_API).
The user picks the folder once (remembered via IndexedDB) and all reading +
PDF building runs client-side. **Works in Chrome/Edge on desktop.** Other
browsers fall back to the bundled demo portfolio.

## Deploy to Vercel

`web/` is a static site — no build step.
1. <https://vercel.com/new> → import `ezanbhutta/logo-showcase`.
2. **Root Directory** = `web`. Framework: **Other**. Build command: empty.
3. Deploy.

## Files

```
web/
├── index.html / app.js / styles.css   app shell, controller, design system
├── src/
│   ├── portfolio.js   read deliverable-type folders, parse brand from filename
│   ├── themes.js      10 baked-in studio identities + folder-name detection
│   ├── pdf.js         client-side themed PDF (slice / range / lookbook)
│   ├── images.js      in-browser preview downscaling
│   └── source.js      File System Access handle persistence
├── fonts/             Inter, Space Grotesk, JetBrains Mono (UI) + 7 PDF families
├── lib/               pdf-lib + fontkit (vendored)
└── demo/portfolio/    bundled demo portfolio (works before linking)
```
