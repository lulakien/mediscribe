# MediScribe Local — DESIGN.md

Design and architecture specification for migrating MediScribe Local from the
working Gradio prototype (`audio_transcriber/`) to a polished Electron desktop
app. This document is the implementation contract for later phases.

**Status of this document:** Phase 1 deliverable. No implementation has started.
The Gradio prototype remains the working reference app until the Electron
version reaches feature parity.

---

## 1. Product Vision

MediScribe Local is a **local-first transcription studio for Turkish medical
lectures**. A medical student records lectures (often in noisy conference
halls), drops the audio files into the app, and gets clean, study-ready
transcripts — TXT for reading, timestamped Markdown for review, segment JSON
for tooling — all produced on their own GPU, with nothing leaving the machine.

The next version keeps the proven ML core untouched and replaces the Gradio
shell with a calm, warm, premium desktop experience:

- **From tool to studio.** The prototype looks like a developer utility. The
  new app should feel like a quiet study companion: warm paper, wood, and
  terracotta instead of gray dashboard chrome.
- **Zero-config daily use.** Presets ("Best Quality", "Bad Audio / Conference
  Hall", …) replace manual beam-size/compute-type fiddling. Advanced settings
  exist but stay folded away.
- **Model management for humans.** Downloading and testing Whisper models is a
  first-class, friendly UI — not a hidden cache directory.
- **Privacy as a visible feature.** "Local. Private. Yours." is part of the
  identity, shown in the UI, not buried in docs.

Non-goals for v1: cloud transcription, accounts, auto-update, real-time
(live-mic) transcription, editing transcripts in-app.

### Hard constraints carried over from the prototype

- Transcription core (`transcribe_core.py`) is **reused, not rewritten**.
- All five output artifacts are preserved per file: timestamp-free TXT,
  timestamped MD, segments JSON, manifest CSV+JSON, run logs.
- Default workflow is fully local; no audio ever uploaded in local mode.
- No paid APIs required; no API keys required for local models.
- Target machine: Ubuntu 26.04, RTX 4070 Mobile 8 GB VRAM, 32 GB RAM.
  Best-known settings: `large-v3`, `cuda`, `float16`, `beam_size=5`, VAD on,
  optional loudness normalization.

---

## 2. Design References

Two reference sites were inspected for inspiration. **We adapt patterns, never
copy assets, text, logos, imagery, or brand elements.**

### 2.1 Notes from Ventriloc (structure / layout)

Observed patterns worth adapting:

- **Strong hero**: one large headline, one short supporting paragraph, two
  CTAs side by side (primary + quiet secondary).
- **Trust strip directly under the hero** (logos / counters). We adapt this
  into a *local-status strip*: "● Local only · CUDA ready · large-v3 installed".
- **Repeating card rhythm**: every service block follows the same structure
  (title → label → short body → link). We reuse this as the template for
  preset cards, model cards, and result cards.
- **Generous whitespace, short paragraphs, clear H1/H2 hierarchy, small
  descriptive subtitles** under nav items.
- **CTA-driven flow**: the primary action is repeated at natural decision
  points. In-app: "Start transcribing" appears in the hero, in the Transcribe
  page header, and in empty states.

### 2.2 Notes from CarmoWood (color / atmosphere)

Observed patterns worth adapting:

- **Earthy, wood-driven palette**: warm browns, sand/beige neutrals, deep
  charcoal text on off-white backgrounds — premium without being flashy.
- **Grounded, organic, quietly confident mood**; nature and craftsmanship as
  themes rather than tech gloss.
- **Scroll-led storytelling** with a full-bleed hero and a "scroll/continue"
  cue — adapted into the welcome screen's continue interaction.
- **Card grids with category tags and location labels** — adapted into result
  cards with duration/model/status tags.
- **Restrained monochrome treatment for secondary chrome** (footer, badges).

### 2.3 How inspiration is adapted, not copied

| Source | We take | We do NOT take |
|---|---|---|
| Ventriloc | Section rhythm, hero + trust strip, card template, CTA cadence | Text, logos, client imagery, French copy, exact layout |
| CarmoWood | Warm earth palette direction, organic calm, scroll cue, tag-labeled cards | Photography, brand marks, taglines, the wood-industry identity |

All colors, copy, illustrations, and the waveform motif are original to
MediScribe. No images or assets from either site are used.

---

## 3. Visual Identity

### 3.1 Mood

Calm · warm · premium · private · study-focused. "A well-lit desk with paper
and a wooden surface," not "a server dashboard." Medical in competence, not in
hospital sterility.

Explicitly avoided: dark-gray developer dashboards, neon/glow AI aesthetics,
cold SaaS blue, clinical teal/green, dense settings-first screens, anything
that reads as Gradio.

### 3.2 Color palette (design tokens)

Light, warm-paper theme is the default. Define as CSS variables (HSL) consumed
by Tailwind config and shadcn/ui theme. Hex values below are canonical.

**Neutrals / surfaces**

| Token | Hex | Use |
|---|---|---|
| `--bg` | `#F4EFE4` | App background (warm paper) |
| `--surface` | `#FFF9EE` | Cards, panels, dialogs |
| `--surface-2` | `#E8DDC8` | Secondary surfaces: sidebar, table header rows, code/log wells (tinted darker `#EFE6D2` variant allowed) |
| `--border` | `#D8C7A6` | Default 1px borders |
| `--border-strong` | `#C4AE85` | Focused/hovered borders, dividers needing emphasis |

**Text**

| Token | Hex | Use |
|---|---|---|
| `--text` | `#171511` | Primary text (deep charcoal, near-black warm) |
| `--text-muted` | `#5C5547` | Secondary text, labels, captions |
| `--text-faint` | `#8A8170` | Placeholders, disabled text, timestamps |

**Brand / accents**

| Token | Hex | Use |
|---|---|---|
| `--primary` | `#B65A2A` | Terracotta. Primary buttons, active nav, progress fill, links |
| `--primary-hover` | `#9E4C21` | Primary hover/pressed |
| `--primary-soft` | `#F3DECF` | Primary tinted backgrounds (selected rows, active pill) |
| `--wood` | `#6B4A2D` | Wood brown. Headings accents, icon strokes, hero typography accents |
| `--olive` | `#7A8450` | Muted olive. Secondary accent: VAD badge, "ready" hints, decorative waveform layers |
| `--olive-soft` | `#E7E9D8` | Olive tinted backgrounds |

**Semantic states** (muted, never neon)

| Token | Hex | Use |
|---|---|---|
| `--success` | `#5E7D4F` (muted green) on `--success-soft` `#E4EAD9` | Completed jobs, "Installed", "Ready on CUDA" |
| `--warning` | `#B07D2E` (soft amber) on `--warning-soft` `#F3E6C9` | Warnings, skipped files, low language probability |
| `--error` | `#8E3B2F` (deep brick red) on `--error-soft` `#F0DCD6` | Failed jobs, load failures. Never bright red |
| `--info` | `#6B6049` (warm slate) on `--surface-2` | Neutral informational badges |

**Optional dark theme ("Study Night")** — same hue family, not gray-blue:
background `#201B14`, surface `#2A241B`, border `#473D2E`, text `#F0E9DA`,
primary stays terracotta `#C96A38` (lightened for contrast), semantic colors
lightened equivalently. Dark theme is a Settings option, not the default.
Implementation may ship dark theme in a later phase; tokens must be defined
from the start so components never hard-code hex values.

**Contrast requirements**: `--text` on `--bg`/`--surface` ≥ 12:1 (passes).
`--primary` on `--surface` is reserved for large text/icons/fills; button
text is `#FFF9EE` on `--primary` (≥ 4.5:1). Verify every semantic-on-soft
pairing at ≥ 4.5:1 for normal text before shipping.

### 3.3 Typography

Bundle fonts locally (e.g. `@fontsource/*` packages) — the app must render
identically offline. **Never load fonts from a CDN.**

- **Display / headings: Fraunces** (variable, optical sizing). A warm,
  slightly old-style serif that gives the paper-and-wood character. Use for
  the welcome hero, page titles (H1/H2), and large empty-state headlines.
  Weights 500–600; use the `SOFT`/`WONK` axes conservatively (default 0).
- **UI / body: Albert Sans.** Humanist sans, friendly but neutral. All body
  text, controls, tables, forms. Weights 400/500/600.
- **Mono: IBM Plex Mono.** Timestamps, file paths, durations, realtime
  factor, log output. Weight 400/500.

Scale (rem, 16px base): `display` 3.0 / `h1` 1.75 / `h2` 1.375 / `h3` 1.125 /
`body` 0.9375 / `small` 0.8125 / `mono-small` 0.8125. Line height 1.5 body,
1.15 display. Headings letter-spacing -0.01em; small-caps labels (preset
names, badge text) use Albert Sans 600 at 0.75rem with +0.06em tracking.

Turkish character support (ş, ğ, ı, İ, ç, ö, ü) must be verified in all three
fonts at all used weights — Fraunces, Albert Sans, and IBM Plex Mono all cover
Turkish in their Google Fonts builds; confirm in the bundled subsets (use
`latin-ext` subset).

### 3.4 Spacing

4px base unit. Standard steps: 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96.

- Page gutter: 32px (min 24px below 1100px window width).
- Card padding: 24px; compact cards (queue rows, stat chips): 16px.
- Section vertical rhythm: 48px between major page sections.
- Sidebar width: 232px expanded, 64px collapsed (icon rail).
- Max content width: 1200px, centered; Results preview pane may extend wider.
- Be generous: when in doubt, add space. The Ventriloc takeaway is rhythm and
  air, not density.

### 3.5 Border radius

- Cards, dialogs, popovers: **14px**.
- Buttons, inputs, selects: **10px**.
- Badges/pills, preset chips: **999px** (full).
- Tables: container 14px, rows square.
- Never mix arbitrary radii; only these three values.

### 3.6 Card style

- Background `--surface`, 1px `--border`, radius 14px.
- Shadow: very soft and warm, e.g. `0 1px 2px rgba(23,21,17,0.04), 0 4px 16px
  rgba(107,74,45,0.07)`. No harsh black shadows, no glassmorphism, no heavy
  elevation stacks.
- Hover (interactive cards only): border → `--border-strong`, shadow grows
  slightly, translateY(-1px), 150ms ease-out.
- Selected state: 1.5px `--primary` border + `--primary-soft` tint at 40%.
- Optional texture: a single subtle paper-grain overlay (tiling PNG/SVG noise
  at 2–3% opacity) on the app background only — never on cards or text areas.

### 3.7 Icon style

- **Lucide** icons (ships well with shadcn/ui), 1.5px stroke, sizes 16/20/24.
- Color `--text-muted` default; `--primary` for active nav; semantic colors
  inside badges only.
- No emoji in the UI. No filled/duotone icon mixing.
- Domain icons: waveform, file-audio, folder, cpu/gpu (use `gauge`/`zap`
  judiciously), stethoscope is allowed once (welcome screen) but the identity
  leans on the **waveform motif**, not medical clipart.

### 3.8 Animation style

Calm and physical; nothing bouncy or neon. Durations 150–300ms for
micro-interactions, 600–900ms for the welcome sequence. Easing:
`cubic-bezier(0.22, 1, 0.36, 1)` (ease-out-quint feel) for entrances,
`ease-in-out` for state morphs. Use the **Motion** library (`motion/react`)
for React; CSS-only where trivial. Full spec in §8.

---

## 4. App Information Architecture

```
MediScribe Local (Electron window, min 1024×700, default 1280×800)
│
├── Welcome (full-window overlay route; first launch, or via Settings toggle)
│
└── Workspace shell
    ├── Left sidebar (nav rail)
    │   ├── Transcribe        (default page)
    │   ├── Models
    │   ├── Results
    │   ├── Jobs              (queue & history)
    │   ├── Settings
    │   └── Advanced ▸ Logs   (visually de-emphasized, bottom of rail)
    └── Status footer strip (persistent, 36px):
        ● Local mode · Backend: running · CUDA: ready · Default model: large-v3
```

Routing: React Router (hash or memory router — file:// safe). Routes:
`/welcome`, `/transcribe`, `/models`, `/results`, `/results/:jobId`, `/jobs`,
`/settings`, `/advanced`.

- **Welcome** — hero + animation + CTA. Shown when `showWelcomeOnLaunch` is
  true or store has no `firstLaunchCompleted` flag.
- **Transcribe** — daily driver: add files, preset, output folder, run.
- **Models** — model center: installed/available, download, test, default.
- **Results** — completed jobs, search, preview TXT/MD (+JSON in advanced
  mode), open folder, copy paths.
- **Jobs** — running/completed/failed/skipped with per-file metrics. (Kept as
  a separate page; the Transcribe page shows only the *current* run inline.)
- **Settings** — defaults, welcome toggle, theme, advanced backend settings,
  future API placeholder, privacy statement.
- **Advanced / Logs** — collapsed by default; surfaces automatically only on
  error (see §6.7).

Sidebar behavior: icons + labels; collapses to icon rail below 1100px width.
Active item: `--primary-soft` pill + `--primary` icon/text. The "Advanced"
item is rendered in `--text-faint` and separated by a divider to keep the
daily IA clean.

---

## 5. Key User Flows

### 5.1 First launch
1. Electron starts → main process spawns Python backend (§9) → splash-less:
   the Welcome route renders immediately while backend boots in background.
2. Welcome animation plays (waveform → transcript cards → clean notes, §8.1).
3. CTA **"Enter workspace"**. Secondary quiet link: "What stays on this
   device?" → opens privacy explainer modal.
4. On CTA click: persist `firstLaunchCompleted=true`; navigate to Transcribe.
5. If backend health check hasn't succeeded yet, Transcribe shows a calm
   "Warming up the local engine…" inline state (not a blocking spinner page).
6. If no model is installed, Transcribe shows a guided empty state: "No model
   installed yet → Go to Models" (primary path), so the first session leads
   the user through model download naturally.

### 5.2 Add audio files
1. Transcribe page → **"Add audio files"** button or drag-and-drop anywhere
   onto the drop zone card.
2. Button calls Electron `dialog.showOpenDialog` (multi-select, filters:
   mp3/mpeg/mpga/m4a/wav/flac/ogg/opus/webm — keep in sync with
   `AUDIO_EXTENSIONS` in `transcribe_core.py`).
3. Renderer sends absolute paths to backend `POST /files/inspect`; backend
   returns per-file metadata (ffprobe duration, size, codec) and supported
   flag (reusing `collect_audio_files_from_selection` semantics).
4. UI appends rows to the selection table; unsupported files appear with a
   warning badge and reason, and are excluded from the run (matching current
   prototype behavior where they become `unsupported` manifest rows).
5. Summary chips update: *n files · total duration · total size*.

### 5.3 Run dry-run (scan only)
1. With files selected, user clicks secondary button **"Scan only"**.
2. Backend runs `transcribe_files(..., dry_run=True)` in the job worker.
3. Queue rows fill with status `scan_only`, durations, warnings (e.g.
   "Outputs already exist"), without loading any model.
4. Completion toast: "Scan complete — 6 files, 3h 12m total, 1 already
   transcribed." Manifest is written as today.

### 5.4 Start transcription
1. User picks preset (default from Settings), output folder (default from
   Settings), optionally expands Advanced to tweak.
2. **"Start transcribing"** → `POST /jobs` with file list + resolved options.
3. UI switches the run panel into active state: current-file card with
   indeterminate→determinate progress, live counters (elapsed, realtime
   factor), queue table updating row-by-row from progress events (§10.4).
4. Model loading is surfaced explicitly ("Loading large-v3 onto CUDA…") since
   it can take tens of seconds.
5. On completion: summary banner (completed/skipped/failed counts, total
   wall time), toast, and "View results" CTA → Results filtered to this run.
6. Cancel: "Stop after current file" button (graceful, §10.2). No hard kill
   of mid-file transcription in v1.

### 5.5 View results
1. Results page lists completed jobs (from manifests), newest first.
2. Search box filters by original filename; filter chips: status, model.
3. Clicking a row opens the detail pane: transcript preview (TXT default,
   tab to timestamped MD; JSON tab only if Advanced mode on), file paths
   with copy buttons, "Reveal in file manager" (Electron
   `shell.showItemInFolder` — fully feasible on Ubuntu).

### 5.6 Download / install a model
1. Models page → "Available" section → card "large-v3-turbo — Faster runs"
   → **Download**.
2. Backend starts download (huggingface_hub snapshot into the standard
   cache); card flips to Downloading state with progress (bytes/percent if
   available, else indeterminate with downloaded-size counter).
3. On finish: status → Installed. Optional follow-up action **"Test on
   CUDA"** loads the model once on GPU and reports "Ready on CUDA · 3.1 GB
   VRAM" or a friendly failure (§6.3).
4. "Set as default" updates Settings and the Transcribe preset hint.

### 5.7 Recover from CUDA OOM
1. During load or run, backend catches CUDA OOM (the core already retries
   `float16 → int8_float16` automatically — preserve this).
2. If the automatic retry succeeds: job continues; a warning badge appears on
   the run ("Reduced precision to fit 8 GB VRAM — quality impact is
   minimal") and is recorded in the manifest warnings as today.
3. If it still fails: job row → Failed with plain-language error: "Not enough
   GPU memory for large-v3. Try the **Low VRAM Safe** preset, or free GPU
   memory and retry." One-click action: "Retry with Low VRAM Safe".
4. Logs panel auto-expands its error excerpt (§6.7) without navigating away.

### 5.8 Switch preset
1. Preset selector (segmented cards or select) on Transcribe.
2. Choosing a preset updates the read-only summary line beneath it:
   "large-v3 · float16 · beam 5 · VAD on · normalization off".
3. If Advanced was manually edited, preset shows as "Custom" until the user
   re-picks a preset (picking one overwrites advanced fields, with the
   previous custom values recoverable via an "Undo" toast for 6s).
4. Preset is stored per-user as default (Settings) and remembered per
   session.

---

## 6. Screen-by-Screen Specification

Common to all pages: page header (Fraunces H1, short muted subtitle, optional
right-aligned primary action), 32px gutter, 1200px max width, persistent
status footer.

### 6.1 Welcome

**Layout** (full window, no sidebar):
- Background `--bg` with subtle paper grain; a large, slow ambient waveform
  band (olive/wood strokes at low opacity) flows horizontally behind content.
- Centered column, max 720px: wordmark "MediScribe" (Fraunces 600) with
  "Local" as a terracotta pill suffix; headline ("Your lectures, transcribed
  on your machine." — final copy in implementation phase, Turkish/English
  copy decision in §16); one supporting sentence; CTA row.
- Below the fold (scroll or "continue" chevron cue, CarmoWood-style): three
  feature cards (Private by design / Built for Turkish medical lectures /
  Study-ready outputs) in Ventriloc card rhythm; then the hero animation
  stage (§8.1) if not placed beside the headline at wide widths.
- CTA: primary **"Enter workspace"**; secondary ghost "Start transcribing"
  may be merged — implementer picks ONE primary label, recommend "Enter
  workspace".

**Components:** Hero, AnimationStage, FeatureCard ×3, PrivacyModal trigger.
**States:**
- *Backend still booting:* CTA stays enabled (workspace handles warming
  state); a faint status line under CTA: "Starting local engine…" → "Local
  engine ready ●" (olive dot).
- *Reduced motion:* static composition of the three animation stages (§8.4).
- No loading spinners, no error states on this screen; backend errors are
  handled after entering the workspace.

### 6.2 Transcribe

**Layout** — two-column above 1100px (left: input & options 7/12; right:
run status 5/12), single column stacked below.

Left column:
1. **Drop zone card** (large, dashed `--border-strong` inner border on a
   `--surface` card): waveform icon, "Drag audio files here", "Add audio
   files" primary-outline button. Accepts drag-and-drop of files (Electron
   provides real paths via `webUtils.getPathForFile`).
2. **Selected files table** (appears once ≥1 file): columns Name / Duration
   / Size / Status (Supported · Unsupported reason) / remove ✕. Footer row:
   summary chips (count, total duration, total size) + "Clear all".
3. **Run options card**:
   - Preset selector: 4 horizontal chips (Best Quality · Bad Audio /
     Conference Hall · Fast Batch · Low VRAM Safe) + "Custom" appears when
     dirty. Below: read-only mono summary of resolved settings, with the
     model's installed-state inline: "large-v3 ✓ installed" or
     "large-v3-turbo ⚠ not installed — Download" (link to Models).
   - Output folder field: read-only path (mono) + "Choose…" (Electron folder
     dialog) + reset-to-default icon button.
   - Collapsible **Advanced** (collapsed by default, chevron): model, device
     (auto/cuda/cpu), compute type, beam size, VAD toggle, normalization
     toggle, overwrite-outputs toggle, backend select (local_whisper active;
     future backends listed but disabled with "Coming later" tag).
4. **Action row**: primary **"Start transcribing"** (disabled w/ tooltip when
   no files / model missing / backend down) + secondary outline **"Scan
   only"**.

Right column — **Run panel** card:
- *Idle:* quiet illustration of stacked note cards + "Ready when you are."
  Last-run mini summary if one exists (n files · time · "View results").
- *Active:* current file name (truncated middle), model status line, overall
  progress bar (determinate, `progress` from events), per-run counters in a
  2×2 mono grid: Elapsed · Files done/total · Realtime factor · Audio
  processed. Below: compact live queue table (rows: file, duration, status
  badge, warning icon w/ tooltip). "Stop after current file" ghost-danger
  button.
- *Finished:* summary banner — olive-soft if all completed; warning-soft if
  skips/warnings; error-soft if any failed. Counts per status, total wall
  time, CTA "View results". **Result preview**: first completed file's first
  ~12 transcript lines in a paper-styled preview well with "Open in Results".

**Empty state** (no files yet): drop zone enlarged, one-line hint listing
supported formats. If no model installed: amber inline notice replaces the
action row — "Install a model first → Models".
**Loading states:** file inspection shows skeleton rows; backend warming
shows disabled actions + "Warming up the local engine…" notice.
**Error states:** backend unreachable → error-soft banner with "Retry
connection" (re-runs health check) and "View logs" quiet link; per-file
failures appear as row badges, run continues (matching core behavior).

### 6.3 Models

A friendly "model center", not a debug page.

**Layout:** header ("Models", subtitle "Everything runs on your machine — no
account, no API keys."), then:
1. **Cache summary strip** (surface-2 card, single row): Local cache
   location (mono path, copy button), total cache size (computed by backend;
   "—" if unavailable), "Refresh" ghost button.
2. **Model cards grid** (2-up ≥1100px, 1-up below). One card per known model,
   installed or not — a single unified list, sectioned by status: "Installed"
   first, then "Available".

**Model card anatomy:**
- Title (model name, Fraunces h3) + status badge (top right).
- One-line human description + small spec tags (size on disk ~GB, relative
  speed, quality dots ●●●○):
  - **large-v3** — "Best quality. The recommended model for lectures." (~3.1 GB)
  - **large-v3-turbo** — "Nearly as accurate, noticeably faster." (~1.6 GB)
  - **medium** — "Lighter fallback when VRAM is tight." (~1.5 GB)
  - **small** — "Fast fallback for quick drafts." (~0.5 GB)
- Default indicator: "Default" pill in `--primary-soft` when set.
- Action row varies by status:
  - *Not installed:* primary-outline **Download**.
  - *Downloading:* progress bar + size counter + Cancel.
  - *Installed:* **Test on CUDA** · **Set as default** · overflow menu ⋯ →
    Delete… (confirmation dialog: model name, size reclaimed, "Delete model"
    danger button; never deletes without confirm).
  - *Ready on CUDA:* (after successful test) success badge with checkmark +
    "loaded in 12.4s" caption; actions same as Installed.
  - *Failed to load:* error badge; card shows plain-language reason +
    "Try again" + "View log excerpt" inline disclosure.

**Status badge set:** Installed (success-soft) · Not installed (neutral) ·
Downloading (primary-soft, animated) · Ready on CUDA (success) · Failed to
load (error-soft).

**States:** loading → skeleton cards; cache scan failure → neutral notice
"Couldn't read cache size" (non-blocking); download failure → card-level
error with retry; no network → downloads disabled with tooltip "Network
needed only for downloading models — transcription stays offline."
**Never** show API-key fields here. Future API backends do not appear on this
page at all (they live behind Settings → Advanced, §13).

### 6.4 Results

**Layout:** master-detail. Left list (5/12), right preview (7/12); below
1100px, list-only with detail as a pushed route.

Left list:
- Toolbar: search input (filters by original filename, instant), filter
  chips: All · Completed · Warnings · Failed; sort: Newest first.
- Result rows (compact cards): filename (strong), date · duration ·
  model tag · status badge; warning count icon if any.

Right preview (selected row):
- Header: filename, metadata line (duration · model · device ·
  realtime factor, mono), status badge.
- **Tabs:** `Text` (timestamp-free TXT) · `Timestamped` (MD rendered with
  mono timestamps styled as quiet pills) · `Segments JSON` (only when
  Settings → Advanced mode is ON; pretty-printed, mono, virtualized).
- Preview well: paper-styled (`--surface`, generous 24px padding, Fraunces
  is NOT used here — body font, 0.9375rem, 1.7 line height for study
  reading). Virtualized scrolling for long transcripts; "Copy all" button.
- **Files section:** each artifact path (TXT / MD / JSON) as a mono row with
  Copy-path button and per-file "Reveal" icon; primary-outline **"Open
  output folder"** (Electron `shell.openPath` / `showItemInFolder`).

**Empty state:** notebook illustration, "No transcripts yet", CTA "Go to
Transcribe". **Loading:** skeleton rows + skeleton preview. **Errors:**
missing file on disk → row stays (manifest is source of truth) but preview
shows "File moved or deleted" notice with the recorded path; manifest
unreadable → page-level error-soft banner with "Open manifests folder".

### 6.5 Jobs / Queue

Separate page (decision: keep Transcribe focused on *current* run; Jobs holds
full history and detail metrics).

**Layout:** header + filter chips (Running · Completed · Failed · Skipped ·
All) + table (full width). Data source: manifests + live job state.

Columns: File · Duration (mono) · Status badge · Processing time (mono) ·
Realtime factor (mono, e.g. `0.18×` meaning 5.5× faster than realtime —
display as `5.5× realtime` for friendliness; keep raw value in tooltip) ·
Model · Warnings/Errors (icon + popover listing the manifest `warnings`
string split on ` | `).

Row expansion (chevron): started/finished timestamps, device/compute used,
output stem, full error message if failed.

**States:** empty → "No jobs yet"; running rows get a subtle animated
left-border shimmer in `--primary`; failed rows tint error-soft at 30%.

### 6.6 Settings

Single scrolling page, grouped cards (max width 760px):

1. **Defaults** — Default output folder (path + Choose…), Default model
   (select; options show installed ✓ / not installed states), Default preset
   (select of the 4 presets).
2. **Appearance & behavior** — "Show welcome screen on launch" (switch,
   default OFF after first launch), Theme (Warm Light · Study Night ·
   System) — ship Warm Light first, keep the control if dark ships later.
3. **Advanced mode** (switch) — reveals Segments JSON tab in Results, the
   Advanced/Logs nav item becomes fully visible (vs. faint), and exposes
   backend settings card below.
4. **Backend (advanced, collapsed)** — backend port strategy info (read-only
   port display), restart backend button, language (default `tr`),
   initial-prompt textarea (prefilled from config; this is the Turkish
   medical prompt — keep editable for power users), temperature /
   condition_on_previous_text (rarely needed; keep in a "rarely needed"
   sub-collapse).
5. **Transcription backends (future)** — placeholder card: "MediScribe
   currently transcribes only on this device. Cloud backends (OpenAI,
   Google, Deepgram, Azure, custom gateway) may be added later and will
   always be opt-in." Disabled select listing the future backends. No key
   fields rendered in v1.
6. **Privacy** — static statement card (olive-soft tint): "Local mode is the
   default and only active mode. Audio never leaves this computer. Network
   is used only when *you* download a model." Link: "Open data folder".
7. **Logs** — switch "Show log panel in workspace footer" (default off);
   button "Open logs folder".

All settings persist via Config manager (§10.6) immediately on change
(no Save button); each card shows a transient "Saved ✓" caption.

### 6.7 Logs / Advanced

Hidden-by-default philosophy: nav item rendered faint at the sidebar bottom;
it brightens with an error-dot badge whenever a job fails or the backend
reports unhealthy, and the relevant pages auto-surface inline log excerpts —
the user is *invited*, never forced, to come here.

**Layout:** header "Advanced" + status card row, then log viewer.
- **Status cards** (4-up): Backend (running/port/uptime · restart action) ·
  CUDA (available, device name, VRAM total if obtainable via
  `ctranslate2`/`nvidia-smi`; "CPU only" state) · ffmpeg/ffprobe (found at
  path / missing with install hint `sudo apt install ffmpeg`) · Cache
  (location, size — mirrors Models strip).
- **Run log viewer:** select a run (by output folder's `logs/run.log`),
  tail view (mono, surface-2 well, auto-scroll toggle, copy button). Shows
  the same content as the core's `LogBuffer`/`run.log`.
- **Manifest access:** mono path rows for `manifest.csv` / `manifest.json`
  with copy + reveal buttons.
- **Debug info:** app version, Electron/Node/Python versions, backend PID —
  one copyable block for bug reports.

**States:** all healthy → calm, no red anywhere; backend down → error card
with "Start backend" action; this page never blocks on errors elsewhere.

---

## 7. Component System

Base: **shadcn/ui** components restyled via the token set (§3.2). Tailwind
theme maps tokens to semantic names (`bg-surface`, `text-muted`,
`border-default`, `bg-primary`, etc.). Components below list only deltas from
shadcn defaults.

**Buttons**
- Primary: `--primary` bg, `#FFF9EE` text, radius 10px, height 40px (36px
  compact), weight 500; hover `--primary-hover`; focus ring 2px
  `--primary` at 40% offset 2px; disabled = 45% opacity + not-allowed
  cursor + tooltip explaining why (always explain disabled primaries).
- Secondary/outline: transparent bg, 1px `--border-strong`, text `--text`;
  hover bg `--surface-2`.
- Ghost: text `--text-muted`, hover bg `--surface-2`.
- Danger: outline style with `--error` text/border; filled danger only
  inside confirmation dialogs.
- Icon buttons: 32×32, radius 10px, ghost behavior.

**Cards** — per §3.6. Variants: `default`, `interactive` (hover lift),
`selected`, `soft` (surface-2, no shadow — used for wells/strips).

**Tables** — container card radius 14px; header row surface-2, small-caps
label style; rows 44px, border-bottom `--border` at 50%; hover surface-2 at
50%; numeric/duration cells mono right-aligned; virtualize above 200 rows
(TanStack Virtual). Selection = `--primary-soft` row tint.

**Badges** — pill, 0.75rem 600, 10px horizontal padding; soft-background +
strong-text pairs per semantic tokens. Status set used app-wide: `Completed`
`Running` `Failed` `Skipped` `Scan only` `Unsupported` `Installed`
`Not installed` `Downloading` `Ready on CUDA` `Failed to load` `Warning`.
Running badge includes a 6px pulsing dot (2s interval, opacity pulse only).

**Progress bars** — track `--surface-2`, fill `--primary`, 6px height,
radius full; indeterminate variant = 30%-width segment sweeping with 1.4s
ease-in-out loop; label slot above (left: stage text, right: mono percent).
Per-file mini progress: 4px height inside queue rows.

**File picker / drop zone** — card with inner dashed border (8px dash, 1.5px,
`--border-strong`), 160px min height; drag-over state: border `--primary`,
bg `--primary-soft` at 30%, icon scales 1.05; rejects non-audio drops with a
shake-free error toast (no jiggle animations).

**Transcript preview** — `--surface` well, 24px padding, body font at 1.7
line-height; timestamp pills (mono, `--text-faint`, surface-2 bg) prefix
each MD block; virtualized; selectable text; "Copy all" top-right ghost
button; max reading measure ~72ch centered.

**Model cards** — per §6.3; fixed min-height so grid stays aligned across
states; download progress replaces the action row in place (no layout jump).

**Toasts / alerts** — toasts bottom-right, surface bg, 14px radius, left
accent bar 3px in semantic color, auto-dismiss 6s (errors persist until
dismissed), max 3 stacked; "Undo" action slot (used by preset overwrite,
§5.8). Inline alerts: soft-bg banners with icon, used for page-level states;
never modal for non-blocking problems. Confirmation dialogs reserved for
destructive actions only (model delete, overwrite-enabled run on existing
outputs — the latter only warns, since the core already skips by default).

**Form controls** — inputs/selects 40px, radius 10px, bg `--surface`, border
`--border`, focus border `--primary` + ring; switches use `--primary` when
on, `--border-strong` track when off; labels small-caps muted style with
4px gap.

---

## 8. Motion and Animation

Library: **Motion for React** (`motion/react`). All animations must respect
reduced-motion (§8.4). Nothing autoplays sound.

### 8.1 Welcome animation concept — "From sound to notes"

A three-stage morph on the welcome screen, total ~2.4s on entry, then
loops a gentle idle state. Staged with Motion orchestration:

1. **Waveform (0–0.8s):** a hand-drawn-feeling waveform path (SVG, stroke
   `--wood` with `--olive` echo layer) draws in left→right
   (`pathLength` 0→1, ease-out). Idle: amplitude breathes ±4% at 6s period.
2. **Segmentation (0.8–1.6s):** soft vertical scan line passes across; the
   waveform splits into 4–5 rounded segment chips (terracotta-tinted cards
   with faux timestamp pills) that slide downward into a column, staggered
   60ms, fading the waveform to 20% opacity behind them.
3. **Clean notes (1.6–2.4s):** chips merge into a single paper card with
   faux text lines (rounded rects in `--text-faint`), a small ✓ checkmark
   draws in `--success`. Title/CTA fade-up (stagger 80ms) alongside.

Parallax: pointer-tilt on the stage at ±3px max (spring, gentle); the
background ambient waveform band drifts at 0.25× scroll speed. A chevron
"continue" cue (CarmoWood-style) fades in after the sequence, scroll or
click advances to feature cards. No particle effects, no glow.

### 8.2 Progress animation

- Overall run bar fills with 300ms ease-out tweens between event values
  (never jumps backward; clamp to monotonic).
- Current-file card: a miniature live waveform shimmer (3 bars, opacity
  pulse, olive) next to the filename — the only "alive" indicator during
  long GPU work; CPU-cheap (CSS transform/opacity only).
- Model-loading stage uses the indeterminate bar + status text; switch to
  determinate on first per-file event.
- Realtime-factor counter ticks with a 200ms count-up tween on change.

### 8.3 File processing transitions

- Queue row status change: badge crossfades (150ms) + row background flashes
  the semantic soft color at 30% for 600ms then settles.
- Completed file: a small ✓ draws in (200ms) in the row.
- New rows (file added): height-expand + fade-up, 200ms, staggered 40ms when
  adding multiple.
- Run summary banner: slide-down + fade, 250ms; result preview lines reveal
  with a single 12-line stagger (20ms each) once — not on every scroll.
- Page transitions: simple 150ms fade + 8px rise; no horizontal slides.

### 8.4 Reduced-motion accessibility

Respect `prefers-reduced-motion` (query via `useReducedMotion`) AND provide
an app-level override implicitly through it (no extra setting in v1):
- Welcome: render final composed frame statically (waveform faded, chips
  column, notes card all visible); CTA appears immediately.
- All transitions become opacity-only ≤100ms; progress bars still move
  (information, not decoration) but without shimmer/pulse effects.
- No parallax, no pointer-tilt, no count-up tweens (values snap).

---

## 9. Desktop Architecture Notes

### 9.1 Process topology

```
┌────────────────────────────────────────────────────────┐
│ Electron main process (Node)                           │
│  • window lifecycle, native dialogs, shell.* calls     │
│  • PythonService supervisor: spawn / health / restart  │
│  • config path resolution (app.getPath('userData'))    │
└──────────────┬─────────────────────────┬───────────────┘
        IPC (contextBridge)        spawn + stdio
┌──────────────▼───────────┐   ┌─────────▼───────────────┐
│ Renderer (React + Vite)  │   │ Python backend (FastAPI │
│  • UI, routing, state    │   │  + uvicorn, localhost)  │
│  • talks HTTP/WS to ─────┼──▶│  • wraps transcribe_core│
│    backend directly      │   │  • job/model/file/config│
└──────────────────────────┘   │    managers             │
                               └─────────────────────────┘
```

- **Security defaults:** `contextIsolation: true`, `nodeIntegration: false`,
  `sandbox: true`. A small preload exposes a typed `window.mediscribe` API:
  `pickFiles()`, `pickFolder()`, `revealPath(p)`, `openPath(p)`,
  `getBackendInfo()` (port/token), `onBackendStatus(cb)`. Everything else
  (jobs, models, settings) goes renderer → FastAPI over HTTP/WebSocket —
  keeps IPC surface minimal and the backend independently testable.
- **Renderer ↔ backend auth:** main generates a random bearer token per
  session, passes it to the backend via env var and to the renderer via the
  preload; FastAPI middleware rejects requests without it. Bind strictly to
  `127.0.0.1`. This prevents other local processes/browsers from driving the
  backend.

### 9.2 React frontend

- Vite + React + TypeScript. Tailwind CSS + shadcn/ui (token-themed).
- State: TanStack Query for backend data (jobs, models, results) + a small
  Zustand store for UI state (selected files, active preset, run panel
  state). WebSocket events invalidate/patch query caches.
- No Node APIs in renderer; only `window.mediscribe` preload + HTTP.

### 9.3 Python / FastAPI backend

- New `desktop/backend/` package imports the **existing**
  `transcribe_core.py` (moved/symlinked per §9.6 structure; the module is
  dependency-light: faster-whisper, yaml, ffmpeg binaries).
- Serves REST + one WebSocket (`/ws/events`) for progress/log events.
- Runs uvicorn with a single worker; transcription executes in a dedicated
  worker thread (§10.2) so the event loop stays responsive.
- Packaging decision for later: ship via PyInstaller-frozen binary OR a
  bundled venv + system Python. **Recommendation: bundle a self-contained
  Python (e.g. python-build-standalone) + pip-installed deps inside the
  Electron resources dir** — PyInstaller + CUDA libs (cuDNN/cuBLAS via
  ctranslate2) is fragile. Validate in Phase 7; keep both paths open by
  never hard-coding the interpreter path (main process resolves it).

### 9.4 Process lifecycle

- App start → main spawns backend with env: `MEDISCRIBE_PORT=0`-style
  ephemeral strategy (§9.5), `MEDISCRIBE_TOKEN`, `MEDISCRIBE_DATA_DIR`.
- Backend prints `READY port=<n>` on stdout; main parses it, then polls
  `GET /health` (200 + version) before reporting "ready" to renderer.
- Heartbeat: main polls `/health` every 10s; on 3 misses → status footer
  shows degraded state + offers restart; auto-restart at most twice, then
  require manual action (avoid crash loops while a GPU is wedged).
- App quit: main sends `POST /shutdown` (graceful: finish current file or
  abort if idle, flush manifests/logs), waits 8s, then SIGTERM, then
  SIGKILL. If a job is running, Electron shows a native confirm dialog
  ("A transcription is running — stop after current file and quit?").
- Crash of backend mid-job: manifests are already written per-file by the
  core (it writes after every file), so completed work is never lost.

### 9.5 Local server port strategy

- Backend binds `127.0.0.1:0` (OS-assigned ephemeral port) and reports the
  actual port on stdout. No fixed port → no collisions with other apps, no
  firewall prompts, multiple app instances possible (though a single-instance
  Electron lock is recommended anyway via `app.requestSingleInstanceLock`).
- Renderer obtains base URL via preload; never hard-code `localhost:8000`.

### 9.6 Repository structure (target)

```
mediscribe/
  prototype_gradio/            # current audio_transcriber/, moved as-is (Phase 0)
    app.py
    transcribe_core.py         # canonical core lives here initially
    config.yaml
    ...
  desktop/
    electron/                  # main, preload, packaging config
      main.ts
      preload.ts
      python-service.ts
    frontend/                  # Vite + React app
      src/...
    backend/                   # FastAPI service
      main.py                  # app factory, routes, ws, auth middleware
      transcribe_core.py       # re-exported/imported from shared (see note)
      model_manager.py
      job_manager.py
      file_manager.py
      config_manager.py
  shared/                      # single source of truth for the core
    transcribe_core.py         # moved here in Phase 3; prototype imports it too
  DESIGN.md
  task.md
```

Note on the core's location: to honor "one core, reused everywhere," Phase 3
moves `transcribe_core.py` to `shared/` and both `prototype_gradio/app.py`
and `desktop/backend/` import it (path shim or editable install). Until that
phase, the file stays untouched in the prototype. **The move is the only
permitted change to prototype files, and only with the prototype verified
working afterward.**

### 9.7 Packaging considerations (Linux-first)

- **electron-builder** with targets: AppImage (primary — runs anywhere,
  matches the user's single-machine use) and `.deb` (Ubuntu-native option).
- Bundle: Electron app + frontend build + Python runtime + backend code.
  ffmpeg/ffprobe: depend on system packages (document `apt install ffmpeg`)
  in v1 — the core already degrades gracefully when missing; bundling ffmpeg
  is a Phase 7 stretch goal.
- CUDA: do NOT bundle the NVIDIA driver/toolkit; ctranslate2 wheels carry
  needed cuBLAS/cuDNN deps via pip extras — verify on a clean Ubuntu 26.04
  in Phase 7. Document driver requirement.
- Model cache and user data live OUTSIDE the app bundle (HF cache +
  `~/.config/mediscribe/`), so app updates never touch models or outputs.

### 9.8 Update strategy placeholder (do not implement yet)

Electron's built-in updater support differs by platform: Squirrel.Mac/
Windows are first-class, while **Linux has no single native auto-update
path**. The plan, when updates are requested later:
- Use **electron-builder + electron-updater**; on Linux, electron-updater
  supports AppImage in-place updates (downloads new AppImage + replaces).
- Alternative/parallel channels: `.deb`/`.rpm` via an apt repo or manual
  download, or package-manager-based distribution later.
- Architectural provision NOW (cheap): app version surfaced in
  Advanced page; a single `UpdateService` interface stub in the main process
  with a no-op implementation; release artifacts already produced by
  electron-builder so adding the updater is config, not rework. No update
  checks, no network calls in v1.

---

## 10. Backend Integration Plan

### 10.1 Reusing `transcribe_core.py`

The core is wrapped, never modified (except the Phase 3 relocation). The
FastAPI layer builds on these existing entry points:

- `transcribe_files(file_paths, output_folder, options, normalize_audio,
  overwrite, dry_run, progress_callback, ...)` — the single run entry point
  used for both real runs and dry-runs (the desktop app always uses explicit
  file selection, mirroring the prototype's `input_mode="selected_files"`
  path via `collect_audio_files_from_selection`).
- `TranscriptionOptions` dataclass — maps 1:1 from preset/advanced UI fields.
- `ProgressEvent` / `ProgressCallback` — already carries `message`,
  `current_file`, `status_rows`, `metrics` (wall time, realtime factor,
  totals), `model_status`, `log_tail`, `progress` (0–1). This is exactly the
  payload the UI needs; serialize with `dataclasses.asdict` to JSON.
- `collect_audio_files_from_selection` — powers `POST /files/inspect`
  validation; `probe_audio` supplies duration/codec/size metadata.
- Manifest readers: `read_existing_manifest` powers Results and Jobs pages
  (manifest JSON is the source of truth for history).
- Existing behaviors preserved as-is: skip-when-outputs-exist, `__dupNN`
  stems, duplicate-hash warnings, float16→int8_float16 CUDA retry,
  ffmpeg/ffprobe graceful degradation, per-file manifest flush.

Known core characteristics the wrapper must design around (NOT fix in core):
- Runs are synchronous and blocking → run in a worker thread (§10.2).
- No mid-file cancellation hook → cancellation is "stop after current
  file" implemented in the job manager by truncating the remaining file
  list, not by interrupting the core. (A cooperative cancel flag inside the
  core is a candidate future enhancement — listed in §16, not v1.)
- One model load per run (backend instance created inside
  `transcribe_files`) → model "Test on CUDA" and warm-cache features live in
  `model_manager`, separate from run flow.

### 10.2 Job manager (`job_manager.py`)

- Single FIFO queue, **one running job at a time** (one GPU; the core is
  also not reentrant-safe by design). `Job = {id, file_paths, options,
  output_folder, normalize, overwrite, dry_run, state, created_at, rows}`.
- Worker: one dedicated `threading.Thread` consuming the queue; calls
  `transcribe_files` with a `progress_callback` that pushes serialized
  events onto an asyncio-safe queue (`loop.call_soon_threadsafe`) for the
  WebSocket broadcaster.
- States: `queued → running → completed | failed | cancelled`. "Stop after
  current file": sets a flag the wrapper checks between files — implemented
  by splitting the run into per-file `transcribe_files` calls? **No** — that
  would reload the model per file. Instead v1 passes the full list and the
  cancel flag simply marks the job; remaining files are reported as
  cancelled in UI while the core finishes the list? Unacceptable. **Chosen
  v1 mechanism:** the wrapper invokes `transcribe_files` once per job but
  pre-chunks is wrong; therefore v1 ships cancellation by raising a
  `CancelledRun` exception from inside the progress callback when the flag
  is set and the event marks a file boundary (`message.startswith
  ("Completed"|"Skipped"|"Failed")`). The core's outer try/except per file
  does not catch callback exceptions between files — verify in Phase 3 with
  a test; if the exception path proves unsafe, fall back to documented
  "cancel = let current job finish" for v1. This is an explicit open risk
  (§16).
- REST: `POST /jobs` (returns job id), `GET /jobs`, `GET /jobs/{id}`,
  `POST /jobs/{id}/cancel`.

### 10.3 Model manager (`model_manager.py`)

- Catalog (static, in code): the four models with HF repo ids
  (`Systran/faster-whisper-large-v3`, `…-large-v3-turbo`, `…-medium`,
  `…-small`), human descriptions, approximate sizes.
- Installed detection: scan HF cache (`huggingface_hub.scan_cache_dir()`)
  for those repo ids; report per-model size on disk + total cache size +
  cache path (honors `HF_HOME`).
- Download: `huggingface_hub.snapshot_download` in a thread; progress events
  over the same WebSocket (`model_download` event type with bytes if
  derivable, else periodic size-of-dir sampling). Cancellable (best effort:
  thread flag + partial-download cleanup note).
- Test load: instantiate `WhisperModel(name, device="cuda",
  compute_type=<from default preset>)` in a thread, time it, release it
  (del + gc); report `ready_on_cuda` with load seconds or a cleaned error
  message. Never leaves a model resident (runs own their model lifecycle).
- Delete: `huggingface_hub` cache deletion API for that repo only; returns
  reclaimed bytes. Requires explicit `confirm=true` body field.
- REST: `GET /models`, `POST /models/{id}/download`,
  `POST /models/{id}/test`, `DELETE /models/{id}`, `POST /models/refresh`,
  `PUT /settings/default-model` (via config manager).
- No API keys anywhere in this module.

### 10.4 Progress events

One WebSocket `/ws/events`; JSON envelope:

```json
{ "type": "job_progress" | "job_state" | "model_download" |
          "model_test" | "backend_status",
  "jobId": "…", "ts": "ISO8601", "payload": { …ProgressEvent asdict… } }
```

- `job_progress` payload = serialized core `ProgressEvent` verbatim
  (message, current_file, status_rows, metrics, model_status, log_tail,
  progress). The UI derives: run bar (`progress`), queue table
  (`status_rows`), counters (`metrics`), model status line, and the log
  excerpt (`log_tail`) shown on errors.
- Renderer reconnects with backoff; on reconnect, `GET /jobs/{id}` returns
  the last event snapshot so the UI never desyncs.

### 10.5 Logs & manifests

- Core already writes `logs/run.log` and `manifests/manifest.{csv,json}`
  under each output folder — unchanged.
- Backend adds: `GET /runs/logs?output=<folder>` (tail N lines),
  `GET /results?output=<folder>` (parsed manifest rows for Results/Jobs
  pages), `GET /results/preview?path=<txt|md|json>` (returns file content,
  size-capped, path-validated against known output roots from manifests —
  never serve arbitrary paths).
- Backend's own service log (uvicorn + wrapper) goes to
  `<userData>/backend.log`, surfaced on the Advanced page.

### 10.6 Config manager (`config_manager.py`)

- Single JSON file at `$XDG_CONFIG_HOME/mediscribe/config.json` (Electron
  passes the dir; backend owns the file). Schema (versioned, `"v": 1`):
  `defaultOutputFolder`, `defaultModel`, `defaultPreset`,
  `showWelcomeOnLaunch`, `firstLaunchCompleted`, `theme`, `advancedMode`,
  `language`, `initialPrompt`, `customAdvanced` (last custom option set),
  `apiGateway` (future block, default `{ "enabled": false }`).
- The prototype's `config.yaml` remains the prototype's config; the desktop
  app seeds defaults from the same values (model `large-v3`, language `tr`,
  the Turkish medical `initial_prompt`, etc.) but does not share the file.
- REST: `GET/PUT /settings`. Secrets are never stored here (§13).

### 10.7 File manager (`file_manager.py`)

- `POST /files/inspect`: validates selection (extension whitelist =
  `AUDIO_EXTENSIONS`), probes metadata, returns supported/unsupported with
  reasons — thin orchestration over existing core functions.
- Output folder validation: exists/writable check before run; create-if-
  missing with explicit user-visible note.
- Path utilities for the preview endpoint allowlist (§10.5).

---

## 11. Model Management Design

(UI spec in §6.3, backend in §10.3 — this section fixes the product rules.)

- **Unified visibility:** one page shows installed AND available models with
  unambiguous status badges; the user always knows what is on disk and what
  the default is.
- **Download from UI** with progress and cancel; network is used *only*
  here, and the UI says so.
- **Prepare/test from UI:** "Test on CUDA" gives a pass/fail with load time
  — turning "will large-v3 fit?" from a terminal session into one click.
- **Set as default** is one click and reflected immediately in the
  Transcribe preset summary.
- **Delete with confirmation** showing reclaimed space; never silent.
- **Transcribe-page integration:** the preset summary and the Advanced model
  select both render installed state inline (✓ installed / ⚠ not installed
  with a "Download" jump-link). Starting a run with a missing model is
  blocked with a helpful, not scolding, message.
- **Tone guard:** no repo ids, no cache hashes, no "snapshot" jargon in
  default UI; the cache path appears once (cache strip) in mono as plain
  "Stored at: …". Repo ids may appear in Advanced page debug info only.
- **No API keys, ever, for local models.** Future cloud backends live in
  Settings (§13) and never leak into this page.

---

## 12. Privacy and Local-First Design

- **Local mode is the only active mode in v1.** Audio files are read from
  disk, processed by faster-whisper on the local GPU/CPU, and written to
  the local output folder. No telemetry, no analytics, no crash reporting,
  no update checks in v1.
- **The only network operation** is user-initiated model download from
  Hugging Face. The Models page labels this explicitly.
- Backend binds `127.0.0.1` only and requires the per-session token (§9.1)
  — no LAN exposure.
- Visible identity: persistent footer "● Local mode" indicator (olive dot),
  Settings privacy card, welcome-screen privacy modal. Privacy is shown,
  not asserted in fine print.
- Content Security Policy in the renderer blocks all remote origins except
  the local backend URL; fonts/assets are bundled.
- Future API gateway (§13) must be opt-in via explicit settings action, off
  by default, and visually flagged in the footer when ever active ("Cloud
  backend active" amber state) — designed now, implemented later.

---

## 13. Future API Backend Extension Points

The core already defines the seam: `TranscriptionBackend` ABC,
`BACKEND_CHOICES = [local_whisper, openai_transcribe, google_speech,
deepgram, azure_speech, custom_http_gateway]`, and
`FutureBackendPlaceholder` raising `NotImplementedError`. The prototype's
config even reserves an `api_gateway` block. Design provisions:

- **Backend selector** exists in Transcribe → Advanced (disabled non-local
  options, "Coming later" tags) and in Settings → future card. The REST API
  passes `options.backend` through to the core unchanged, so enabling a new
  backend later is: implement the `TranscriptionBackend` subclass + flip UI
  enablement. No route, event, or schema changes.
- **Secrets policy (binding):** API keys are NEVER hard-coded and NEVER
  stored in plain `config.json`. Resolution order when implemented:
  (1) environment variable named in config (matching the existing
  `api_key_env_var` pattern in the prototype's yaml), (2) OS keychain via
  Electron `safeStorage` with the encrypted blob in userData. UI shows
  only "Configured ✓ / Not configured".
- **Per-backend capabilities map** (planned, in code constants): supports
  timestamps? language hint? file-size limits? — so the UI can adapt
  without redesign.
- The manifest schema already records backend-relevant fields
  (`model_name`, `device_used`, …) and would gain `backend` as an additive
  column — additive only, never breaking existing manifest readers.
- v1 ships exactly `local_whisper`; everything above is dormant scaffolding
  with zero runtime cost.

---

## 14. Accessibility

- **Keyboard:** every action reachable by keyboard; logical tab order; file
  table rows focusable with arrow-key navigation; `Enter` opens result
  detail; visible focus ring (2px `--primary` at 40%, 2px offset) on warm
  backgrounds — never remove outlines.
- **Contrast:** all text pairs ≥ 4.5:1 (verified per §3.2); status is never
  color-only — every badge has a text label, warnings carry icons + text.
- **Screen readers:** shadcn/ui (Radix) primitives give correct ARIA for
  dialogs/menus/tabs; add `aria-live="polite"` region for run progress
  announcements ("Completed file 3 of 6") throttled to file boundaries;
  toasts use `role="status"` / errors `role="alert"`; progress bars expose
  `aria-valuenow`.
- **Reduced motion:** full spec in §8.4.
- **Language:** UI copy in clear English for v1 (transcripts are Turkish;
  UI language is an open question, §16); set `lang` attributes correctly on
  transcript preview (`lang="tr"`) so screen readers pronounce Turkish.
- **Hit targets:** ≥ 32px for icon buttons, 40px for primary controls.
- **Long-content handling:** transcript preview keeps a readable measure
  (~72ch) and honors browser zoom (all sizing in rem).

---

## 15. Implementation Phases

Each phase ends with explicit verification before the next begins. The
Gradio prototype stays runnable throughout; parity checklist before it is
ever deprecated.

- **Phase 0 — Preserve the prototype.**
  Move `audio_transcriber/` → `prototype_gradio/` (git mv, no code edits).
  Verify: prototype launches and transcribes one file end-to-end.
- **Phase 1 — DESIGN.md and architecture.** (This document.)
  Verify: review/approval of this spec.
- **Phase 2 — React static UI mock.**
  Vite + Tailwind + shadcn theme tokens; all routes (§4) with mocked data:
  Welcome (with animation), Transcribe, Models, Results, Jobs, Settings,
  Advanced. Runs in a plain browser; a thin mock of `window.mediscribe`.
  Verify: visual review against §3/§6; reduced-motion pass; keyboard pass.
- **Phase 3 — FastAPI backend wrapper.**
  Move core to `shared/`; prototype re-pointed and re-verified. Implement
  managers (§10), REST + WebSocket, job worker. Test cancellation mechanism
  risk (§10.2). Verify: `curl`/pytest-driven run produces byte-identical
  output artifacts vs. prototype for the same file and options (TXT/MD/JSON/
  manifest fields match modulo timestamps).
- **Phase 4 — Electron wrapper.**
  Main + preload (§9.1), backend supervisor (§9.4–9.5), wire renderer to
  live backend, native dialogs, reveal-in-file-manager.
  Verify: full flow on Ubuntu — add files → run → outputs open from UI;
  kill-backend recovery; quit-during-run dialog.
- **Phase 5 — Model manager.**
  Backend module + Models page live: list/download/test/delete/default with
  real HF cache. Verify: fresh-cache download of `small`, test-load on CUDA,
  delete, and large-v3 detection of pre-existing cache.
- **Phase 6 — Results and preview.**
  Manifest-driven Results/Jobs pages, preview endpoints, search/filter,
  copy/reveal. Verify against the user's existing output folder (real
  historical manifests must render correctly — including `__dup` stems and
  `unsupported` rows).
- **Phase 7 — Packaging / update preparation.**
  electron-builder AppImage + deb; bundled Python runtime decision (§9.3);
  clean-machine CUDA validation; `UpdateService` no-op stub; document
  install + ffmpeg prerequisite. Verify: install AppImage on a clean Ubuntu
  26.04 VM, transcribe with GPU.

Parity checklist (gates Gradio deprecation, after Phase 6): multi-file
selection, dry-run, all 5 outputs byte-compatible, skip/overwrite behavior,
duplicate handling, normalization toggle, warnings surfaced, CUDA fallback
behavior, Turkish initial prompt applied.

---

## 16. Resolved Decisions & Open Questions

### 16.1 Resolved Decisions (v1 implementation)

**Decision 1: UI Language**
- **Resolved:** UI language for v1 is **English**.
- **Rationale:** English UI provides broader accessibility and maintainability. The target user (Turkish medical student) is comfortable with English technical interfaces.
- **Scope:** All UI chrome, labels, buttons, settings, and messages are in English. Transcript content remains Turkish (the audio is Turkish medical lectures). The Turkish medical initial prompt (`initial_prompt` in config) is preserved and editable in Advanced settings.
- **Future:** UI copy is kept in a single strings module/file from the start, making localization to Turkish or other languages straightforward in a future release. Set `lang="tr"` attribute on transcript preview wells so screen readers pronounce Turkish correctly.

**Decision 2: Cancellation Mechanics**
- **Resolved:** v1 implements **"Stop after current file"** cancellation, not mid-file interruption.
- **Rationale:** The core (`transcribe_core.py`) runs transcription synchronously per file with no cooperative cancellation hook. Introducing a mid-file cancel mechanism requires either modifying the core (violates the "reuse, not rewrite" constraint) or unsafe exception-based interruption during GPU work.
- **v1 behavior:** The "Cancel" button in the UI is labeled **"Stop after current file"**. The job manager sets a cancellation flag; when the current file completes, the run stops gracefully and remaining files are marked as `cancelled` in the manifest without processing. The current file always finishes.
- **Future work:** True mid-file cancellation (cooperative cancel flag checked during segment iteration inside the core) is documented as a future enhancement and would require opt-in core modification with explicit approval. Document in the backlog: "Add cooperative cancellation support to `transcribe_core.py`'s main loop for interruptible long-file processing."

**Decision 3: Results Indexing Strategy**
- **Resolved:** v1 uses **manifest-based indexing** for the Results and Jobs pages.
- **Rationale:** The core already writes `manifest.json` and `manifest.csv` per output folder. These files are the source of truth for all completed/failed/skipped transcriptions. Reading and merging manifests from recent output folders is sufficient for v1 scale (typical use: hundreds of files per student, not tens of thousands).
- **v1 behavior:** 
  - Results page lists all rows from the selected output folder's manifest.
  - Settings stores a "recent output folders" list (up to 10); Results can union manifests from all recent folders or filter to one folder.
  - No SQLite database, no indexing service, no background filesystem scanning.
  - Searching/filtering happens in-memory on the loaded manifest rows (fast for typical dataset sizes).
- **Future work:** If scale demands it (e.g., a lecturer with 10,000+ files across many semesters), a lightweight SQLite index or a background manifest-aggregation service can be added without changing the manifest format or the Results page contract. Not needed for v1 target user (medical student, ~100–500 lecture files per year).

### 16.2 Open Questions (deferred or future phases)

3. **Dark "Study Night" theme:** ship in v1 or defer? Tokens are defined
   either way; recommendation: defer to post-parity polish.
4. **Output folder default:** keep prototype's `output/` convention or move
   to `~/Documents/MediScribe/`? Recommendation: `~/Documents/MediScribe`
   as the new default, existing folders still selectable.
5. **distil/whisper additions to the catalog** (e.g. distil-large-v3) — out
   of scope for v1 catalog, easy to add later?
6. **ffmpeg bundling** (Phase 7 stretch) vs. documented apt dependency.
7. **Per-file progress granularity:** the core reports progress at file
   boundaries only; is intra-file progress (segment-count-based estimate)
   worth a future core enhancement, or is the live "current file + elapsed"
   treatment (§8.2) sufficient? v1 assumes sufficient.
8. **Welcome hero copy and final wordmark treatment** — needs a quick
   review round during Phase 2 with real rendering.
9. **Manifest as single source of truth for Results:** resolved above (§16.1 Decision 3).

---

*End of DESIGN.md.*
