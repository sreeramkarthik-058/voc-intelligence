# VoC Intelligence Tool

## What this app does
AI-powered Voice of Customer analysis tool for Product Managers.
Takes customer feedback (pasted text or uploaded CSV/Word doc),
analyses themes and sentiment using Claude Haiku, searches the
web using Exa MCP for market research, and generates downloadable
executive presentations as .pptx files.

## Build phases
- Phase 1 — Core analysis (themes, sentiment, both) ✅
- Phase 2 — File upload (.txt, .csv, .docx) + Exa market research ✅
- Phase 3 — PDF and plain-text export ✅
- Phase 4 — Executive presentation agent (.pptx generation + in-browser viewer) ✅
- Phase 4 upgraded — Futuristic theme system, 8 slide types, template upload ✅
- Phase 5 — Deployment (Render / Railway / Fly.io)

## Tech stack
- Frontend: HTML, CSS, vanilla JavaScript
- Backend: Node.js + Express
- AI: Anthropic Claude Haiku (`claude-haiku-4-5`) via `@anthropic-ai/sdk`
- Search: Exa web search via `exa-js` package
- PPT generation: `pptxgenjs` v4
- File parsing: `mammoth` (.docx), `csv-parse` (.csv), `multer` (upload)
- Template parsing: `adm-zip` (unzip .pptx) + `fast-xml-parser` (parse theme XML)
- PDF export: `html2pdf.js` (CDN, client-side)

## Architecture
- `server.js` — Express server; registers both API route files
- `routes/analyze.js` — analysis route: Claude Haiku + optional Exa search
- `routes/presentation.js` — presentation agent: Claude Haiku → slide JSON → pptxgenjs → base64; also handles template extraction route
- `utils/fileParser.js` — CSV and Word doc parsing
- `utils/templateParser.js` — unzips .pptx buffer, parses `ppt/theme/theme1.xml`, returns theme object
- `public/index.html` — frontend UI
- `public/app.js` — frontend logic (wizard, rendering, dark mode, metric cards, animations, presentation form, slide viewer)
- `public/styles.css` — full design system with dark mode and animations

## Analysis route (routes/analyze.js)
- Accepts multipart form: `analysisType` (themes | sentiment | both) + `text` or `file`
- Calls Claude Haiku with a JSON-only prompt; parses structured response
- Exa search: called once per identified theme if `EXA_API_KEY` is set; non-fatal if missing
- Returns `{ success, analysisType, data, marketResearch, metadata }`

## Presentation agent (routes/presentation.js)
- `POST /api/presentation` — receives `{ report, instructions, customTheme? }`
- `summariseReport(report)` condenses the structured report to compact text — never passes raw feedback; numeric values are labelled explicitly (SENTIMENT_SCORE:, POSITIVE_PCT:, etc.) so Claude maps them to stat cards
- Calls Claude Haiku with slide-structure prompt; Claude returns JSON `{ theme, style, slides[] }`
- `customTheme` (from uploaded template) overrides Claude's theme choice if provided
- `buildPptx(slides, theme)` renders slides via pptxgenjs v4 (13.33″ × 7.5″ LAYOUT_WIDE)
- Returns `{ success, slides, theme, style, totalSlides, pptxBase64 }`
- pptxgenjs requires hex colours WITHOUT the `#` prefix — use `hexColor(raw, fallback)` helper
- `express.json({ limit: '2mb' })` is required in server.js to handle the report payload

## Template extract route (routes/presentation.js)
- `POST /api/template/extract` — accepts multipart `.pptx` file via multer memory storage
- Calls `extractThemeFromPptx(buffer)` from `utils/templateParser.js`
- Returns `{ success, theme }` — theme object in the standard format
- Validates: file must be `.pptx`; 20 MB size limit
- Error responses: 400 (no file / wrong type), 422 (parse failure)

## Template parser (utils/templateParser.js)
- Accepts a `.pptx` buffer; uses `adm-zip` to unzip and read `ppt/theme/theme1.xml`
- Parses `<a:clrScheme>` with `fast-xml-parser`; handles both `srgbClr` and `sysClr lastClr`
- Extracts: `dk1`, `lt1`, `dk2`, `lt2`, `accent1`–`accent6`
- Extracts font face from `<a:fontScheme>` minor font; falls back to Calibri if font is non-standard or a theme placeholder (`+mn-lt`, `+mj-lt`)
- Safe font list: Calibri, Arial, Segoe UI, Helvetica, Times New Roman, Georgia, Verdana, Trebuchet MS
- Detects dark vs light theme by computing relative luminance of `lt1`
- Returns theme object: `{ name, bgColor, accentColor, secondaryAccent, textColor, mutedText, cardBg, cardBorder, positiveColor, negativeColor, neutralColor, fontFace }`

## Slide types (8 total — returned by Claude, rendered by buildPptx + renderSlide)
- `title` — dark bg, 44pt title, 18pt subtitle, accent phrase, decorative line
- `stats` — up to 4 stat cards (roundRect, left accent stripe, 36pt colored value, 11pt muted label), insight line
- `bullets` — up to 4 bullet rows (ellipse dot + 16pt text), optional footnote; NO pptxgenjs bullet feature
- `comparison` — two equal cards with colored header bands (accent / secondaryAccent), dot + item rows
- `bar_chart` — horizontal bars as `addShape('roundRect')` rectangles (track + fill); fully editable
- `timeline` — circle nodes on a horizontal spine, phase/action/owner text per step
- `quote` — decorative `"` mark, 22pt italic quote, sentiment dot, attribution
- `section_divider` — accent lines above/below, 36pt centered title, 16pt muted subtitle

## Futuristic theme system
All colors are passed as a theme object; `buildColors(theme)` maps them to a `c` dict used throughout all renderers.

**Futuristic Dark (default)**
- bgColor `0A0A1A`, accentColor `6366F1`, secondaryAccent `06B6D4`
- textColor `FFFFFF`, mutedText `9CA3AF`, cardBg `1A1A2E`, cardBorder `2D2D4E`
- positiveColor `22C55E`, negativeColor `EF4444`, neutralColor `EAB308`, fontFace `Calibri`

**Futuristic Light**
- bgColor `F8FAFC`, accentColor `6366F1`, secondaryAccent `0EA5E9`
- textColor `0F172A`, mutedText `64748B`, cardBg `FFFFFF`, cardBorder `E2E8F0`
- positiveColor `16A34A`, negativeColor `DC2626`, neutralColor `CA8A04`, fontFace `Calibri`

**Custom (uploaded template)**
- Extracted from `ppt/theme/theme1.xml` by `utils/templateParser.js`
- Sent from frontend as `customTheme` in the `POST /api/presentation` body
- Overrides Claude's theme entirely; Claude still generates the same slide JSON structure

`resolveColor(name, c)` maps semantic names (`"positive"`, `"negative"`, `"neutral"`, `"accent"`, `"secondary"`) to hex values throughout all renderers.

## Presentation form UI (public/index.html + public/app.js)
- Slide count dropdown: 4 / 6 / 8 / 10 / 12 (default 6)
- Presentation focus dropdown: Executive summary / Detailed analysis / Problem & action plan / Custom (shows free-text input)
- Theme picker: three radio cards — Futuristic Dark / Futuristic Light / Upload Template
- Template upload zone: shown only when "Upload Template" is selected; drag-and-drop or click; POST to `/api/template/extract`; shows extracted color swatches on success
- Optional additional instructions textarea
- `buildInstructionsFromForm()` assembles all fields into one instructions string for the AI
- Guard: if "Upload Template" is selected but no file extracted, shows error and blocks generation

## In-browser slide viewer (public/app.js — renderSlide)
- `renderSlide(index)` uses a `switch` on `slide.type` to render all 8 types as HTML
- `tc(name, theme)` resolves semantic color names to `#hex` CSS strings (adds `#` prefix)
- `isThemeDark(theme)` checks `bgColor` luminance to drive bg/text color selection
- `buildThumbnails()` uses `bgColor` / `textColor` / `accentColor` from the new theme format
- Viewer is view-only — the real output is the `.pptx` download

## Editability rules (pptxgenjs rendering)
- NEVER use `addImage()` for text content — all text must be `addText()`
- Every text element is its own `addText()` call — independently selectable in PowerPoint
- Shapes use `addShape()` — rectangles, circles, all decorative elements
- Bar charts are `addShape('roundRect')` rectangles — each bar individually resizable
- `rectRadius` used for rounded shapes (keep 0.05–0.2 for Google Slides compatibility)
- Transparency below 10% on shapes renders inconsistently in Google Slides — avoid
- All colors: 6-char hex WITHOUT `#` prefix (pptxgenjs requirement)

## UI design system (public/styles.css + public/index.html)
- Page background: `#F8F7F4` (warm off-white)
- Card background: `#FFFFFF`; card borders: `1.5px #E5E7EB`; border-radius: 12px
- **Amber `#D97706`** — all primary actions (buttons, active states, accents)
- **Purple `#7C3AED`** — themes, tags, secondary actions
- Dark mode: toggled via button in header; stored in `localStorage`; respects `prefers-color-scheme` on first load; applied via `[data-theme="dark"]` on `<html>`; dark bg `#1A1A1A`
- Logo: amber-to-purple gradient 36px rounded square
- Typography: 0.9rem base (~14.4px), line-height 1.65 (~24px); section labels: 0.72rem uppercase + horizontal divider extending right
- Outer padding: 28px; inner card padding: 20px

## Animations (all wrapped in prefers-reduced-motion)
- `fadeUp` — report sections fade + translate in on render
- `amberPulse` — primary button glow on idle state
- `barGrow` — sentiment breakdown bars animate from 0 to value
- `countUp` — JS requestAnimationFrame count-up on the 3 metric cards (sentiment score, negative %, themes found)

## Accessibility (WCAG AA)
- All interactive elements: `aria-label`, `type="button"`, `min-height: 44px`
- Focus: `:focus-visible` 2px amber outline, offset 3px
- ARIA roles: tabs (`role="tab"`, `aria-selected`, `aria-controls`), alert banner (`role="alert"`), loading section (`aria-live`)
- No colour-only information: all badges and states have text labels
- `prefers-reduced-motion` respected for all animations

## Metric cards (public/app.js — renderMetricCards)
- Shown at the top of the report panel after analysis completes
- Three cards: Sentiment Score (amber), Negative % (red), Themes Found (purple)
- Displays "N/A" gracefully when a metric is not applicable to the selected analysis type
- Count-up animation on numeric values via `countUp(el, target, duration)`

## Cost optimisation rules
- Always use Claude Haiku (`claude-haiku-4-5`) — NEVER Sonnet or Opus
- Only call the AI when the user explicitly triggers it
- Pass structured report to presentation agent — never raw feedback
- Presentation agent only fires when user clicks "Generate Presentation"
- Template extraction (`/api/template/extract`) is a separate call — never bundled with generation
- Never make unnecessary API calls

## What Claude Code must never do
- Never change the model from `claude-haiku-4-5`
- Never modify the `.env` file
- Never call the presentation agent automatically
- Never use a hardcoded slide count or style
- Never commit API keys or secrets
- Never remove the `prefers-reduced-motion` guards on animations
- Never remove `aria-label` attributes from interactive elements
- Never use `addImage()` for text or shape content in pptxgenjs
- Never pass raw feedback text to the presentation agent — always `summariseReport()` first

## Current state
- Core analysis working — themes, sentiment, market research via Exa
- Presentation agent upgraded — 8 slide types, futuristic themes, template upload
- UI redesigned — white base, amber + purple accents, structured presentation form
- GitHub repo live at github.com/sreeramkarthik-058/voc-intelligence
- Deployed: not yet — Phase 5 pending

## Remaining to do
- Deploy to web (Render or Railway)
