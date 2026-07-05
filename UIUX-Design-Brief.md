# UI/UX Design Brief — Logo Showcase · HaseebMadeIt

**For:** Tigravity (design partner)
**Scope:** **UI and UX only.** Redesign how the product *looks and feels*.

> ## ⛔ Scope guardrail — read first
> **Only interfere with UI and UX.** Do **not** change, remove, or redesign any
> functionality, logic, data model, file/folder structure, naming conventions,
> filters behavior, PDF generation, or the way the app reads local folders.
> Those are finalized and working. Your job is purely the **visual design,
> layout, interaction design, motion, states, accessibility, and microcopy** of
> the existing screens and flows. Every existing feature, control, and state must
> still be present after your redesign — you are re-skinning and refining the
> experience, not re-architecting the product.

---

## 1. What the product is

**Logo Showcase** is a tool for a branding studio to turn a folder of client
logos and brand deliverables into beautiful, on-brand **PDF decks** — and to
browse/preview every deliverable — entirely in the browser. Files never leave the
user's computer.

- Runs as a **static web app** (deployed on Vercel). Desktop-first; primary
  browsers are **Chrome and Edge** (it reads a local folder via the File System
  Access API).
- The user links **one folder per studio** once; the studio identity/theme is
  auto-detected from the folder name. There is **no profile dropdown**.
- **Light and dark themes** are both required (there is a theme toggle).

> **Not in scope:** the visual design of the *generated PDF decks* themselves is
> a separate, already-completed track (10 per-studio print themes). This brief is
> about the **web app interface** only.

---

## 2. The design boundary (very important)

The app is hand-built **vanilla HTML/CSS/JS with no framework and no build step**,
and the JavaScript binds to specific DOM element **IDs, `data-*` attributes, and
class names**. To keep functionality intact:

- **If you deliver designs (Figma/mockups/specs):** cover every screen and every
  state listed in §4–§6. No code contract to worry about.
- **If you also implement the redesign in code:** you may restyle freely, but you
  **must preserve the existing DOM hooks** — element `id`s, `data-*` attributes,
  the tab/segmented-control structure, form control `id`s, and the class names the
  JS relies on. Do not rename or remove them, and do not alter any `.js` logic.
  If a structural change is unavoidable, flag it — do not silently change behavior.
- Keep it **framework-free and build-free** (plain CSS + a little JS). No React,
  no Tailwind build, no bundler.
- Everything must stay **self-contained and offline-friendly** (fonts/assets local).

---

## 3. Current design language (your starting point — improve it)

**Type**
- UI sans: **Inter** (400/500/600/700)
- Display accents: **Space Grotesk** (600/700)
- Mono (labels, counts, code, folder names): **JetBrains Mono** (400/500)

**Color tokens (light)**
- Accent (violet): `#7229FF` · Accent-2 `#5E1FD8` · Accent-soft `#F1EBFF`
- Ink `#160A33` · Ink-2/Muted `#534A78` · Dim `#8B82A8`
- Background `#FAFAFE` · Surface `#FFFFFF` · Raised `#F4F2FA`
- Hairlines `#E8E5F3` / `#F0EEFA`

**Color tokens (dark)**
- Accent `#8B5CFF` · Accent-2 `#A77DFF` · Accent-soft `#241A44`
- Ink `#EDEAF7` · Ink-2 `#B4ACD0` · Muted `#8B82A8`
- Background `#0E0B1A` · Surface `#181327` · Raised `#211A38` · Hairlines `#2C2545`

**Style now:** rounded cards (~16px), soft elevation, generous spacing, subtle
motion (~120–320ms easings), a violet-forward, premium/agency feel. You are free
to evolve this into something more distinctive and "god-level" as long as it stays
premium, calm, and legible — just keep both light and dark first-class.

**Brand:** header shows the app icon (a violet rounded-square mark) + wordmark
"Logo Showcase · HaseebMadeIt". Keep the brand identity coherent.

---

## 4. Screens & regions to design

**Global chrome**
- **Top app bar:** brand mark + wordmark (left), **tab nav** (center), and (right)
  a **⌘K command-palette button**, **theme toggle**, and a **source badge** ("Demo
  portfolio" vs the linked studio name, with a live dot).
- **Connect banner** (dismissible strip): prompts linking the `<Studio> Portfolio`
  folder; also used for a "reconnect saved folder" state.
- **Footer:** "Runs in your browser · your files stay on your computer · ⌘K".
- **Toasts** (success / warning / error).
- **Command palette** (⌘K modal): fuzzy list of actions + navigation.

**Tabs** (present when a folder/demo is loaded): **Logos**, **Files**, **Brand
Guidelines**, **Social Media Kit**, **Stationery**, **Logo Animation**, **Settings**.
(The deliverable tabs only appear when that folder exists.)

### 4.1 Logos (the primary workspace — split layout)
Left = controls, right = a **live PDF preview** that updates as you change things.
- **Search** brands.
- **Filters row:** *Industry* (searchable dropdown of all industries) + *Logo type*
  (select).
- **Picker grid:** logo thumbnail cards; clicking selects/orders them (numbered
  selection badges). Foot shows a count ("N logos" / "N selected") + "Use all" /
  "Clear".
- **Output** segmented control: **Curated · All · By type**; when "By type",
  a **Per type** select ("All / Top 3 / Top 5 / Top 10 each").
- **Presentation options** (collapsible): Layout (Grid/Lookbook), Columns, Density
  (Auto/Roomy/Compact), Cover page toggle, Closing page toggle.
- **Live preview pane:** a status line ("Up to date" / "Updating…" / error), a
  **Fullscreen** button, and a **Download PDF** button. Shows a shimmer/skeleton
  while rendering.

### 4.2 Files (folder/subfolder browser)
- One **search** box (searches across all folders — brand, filename, industry).
- **Folders collapsed by default;** clicking a folder header expands it to a
  **tile grid** of that folder's files. Each folder header shows a count.
- **Tiles** = thumbnail + brand name + industry sub-label + a "View ›" affordance.

### 4.3 Deliverable tabs (Brand Guidelines / Social / Stationery / Animation)
- Title + lede, a **search** box, and a **tile grid** of brand deliverables.
- Tiles are **view-only** (open a preview; nothing raw downloads).

### 4.4 Settings
- **Portfolio folder** panel: current source, **Link portfolio folder** button,
  **Disconnect**; an "unsupported browser" callout for non-Chromium browsers.
- **Folder-organization guide:** the `<Studio> Portfolio` structure, a naming-
  convention block (`Brand-Industry-Type` for logos/guidelines; `Brand-Industry`
  for the rest), 5 color-coded deliverable-type cards with filename examples, and a
  Brand/Industry/Type legend. (Keep all the *information*; redesign the presentation.)

### 4.5 Preview modal
- Full-screen-ish modal that previews an image, a PDF (iframe), or a video, with a
  title/subtitle and a close button. Also used to view the live deck fullscreen.

---

## 5. Every state to cover (don't skip these)

For each surface above, design the full state matrix:
- **Empty** (no folder linked → demo; no logos; no deliverables; "no matches").
- **Loading / skeleton / shimmer** (preview rendering; assets loading).
- **Populated** (few items vs many — grids should scale gracefully).
- **Filtered** (active industry/type filter; the "a filter is hiding your logos →
  Clear filters" empty state; search-no-results).
- **Selection** (picker with ordered selection badges; select-all/clear).
- **Error** (preview failed; unsupported browser; folder can't be read).
- **Success feedback** (PDF downloaded; folder linked; toasts).
- **Light and dark** for all of the above.

---

## 6. Interaction & motion
- Debounced **live preview** — the right pane re-renders as controls change; design
  the "updating" ↔ "up to date" transition and the skeleton→content reveal.
- Tab switching, segmented-control toggles, collapsible panels/folders, modal
  open/close, toast in/out, command-palette open + keyboard navigation.
- Hover/focus/active/disabled for all controls; visible **focus rings** for
  keyboard users.
- Keep motion tasteful and fast (roughly 120–320ms).

---

## 7. Constraints & requirements
- **Desktop-first**, but must not break on smaller widths; wide content (grids,
  the preview pane, tables) should never cause horizontal page scroll.
- **Accessibility:** WCAG AA contrast in both themes, full keyboard operability,
  visible focus, proper labels/roles, respects `prefers-reduced-motion`.
- **Both themes** are first-class (not an afterthought).
- **Performance:** lightweight, local assets, no heavy libraries.

---

## 8. Deliverables (suggested)
1. A refined **design system**: color (light+dark), type scale, spacing, radius,
   elevation, motion, iconography.
2. A **component library**: app bar, tabs, buttons/CTA, segmented controls,
   inputs/selects/searchable dropdown, cards (picker + deliverable tiles),
   collapsible folder rows, toggles, toasts, modal, command palette, banners,
   status/skeleton.
3. **High-fidelity screens** for every view in §4, in the key states of §5,
   in **light and dark**.
4. **Interaction/motion** notes (§6) and a **responsive** behavior spec (§7).
5. If implementing: restyled CSS (+ minimal JS for purely-visual behavior) that
   **preserves all existing DOM hooks and app logic** (§2).

---

### One-line summary
Re-skin and elevate the *experience* of an existing, working browser app —
**UI/UX only** — without altering any functionality, data flow, file/naming
conventions, or PDF generation.
