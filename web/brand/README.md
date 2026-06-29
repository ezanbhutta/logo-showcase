# Studio logos

Drop each studio's **original** logo file here, named by its profile id:

```
web/brand/<id>.svg      (preferred — crisp at any size)
web/brand/<id>.png      (transparent background recommended)
web/brand/<id>.jpg
```

Profile ids: `abdul-haseeb`, `alee-studioz`, `bic`, `carpicon`, `dygram`,
`eikon`, `grid`, `storm`, `wedesign`, `xstudioz`.

The file is used **exactly as provided** — placed on the deck cover (rasterised
with transparency, never recoloured or redrawn). After adding a file, add its id
to the `BRANDED` set in `web/src/pdf.js`.
