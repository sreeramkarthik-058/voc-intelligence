# Customer Sentiment Analysis

## What this app does
AI-powered customer sentiment and feedback analysis tool for Product Managers.
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
- Phase 4b — Results page redesign: tabbed layout, action bar, mobile responsive, branding cleanup ✅
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

### AI prompt schema (all three prompts)
All prompts return JSON only — no markdown fences. Key fields:
- `executiveSummary` — 2–4 sentence top-level summary (all analysis types); used by Overview tab
- `topFindings` — array of `{ text: string, severity: "critical"|"moderate"|"info" }` objects (themes / both); used by Overview tab finding cards
- `emotionalTone.tags` — string array of emotion labels e.g. `["Frustrated","Hopeful"]` (sentiment / both); used by Sentiment tab tone pills
- `themes` (themes type): array of `{ name, description, frequency, sentiment, keyInsights[], exampleQuotes[] }`
- `themes` (both type): object with `{ summary, list[], topFindings[], recommendations[] }`
- `sentiment.breakdown` — `{ positive, negative, neutral }` percentages summing to 100
- `notableQuotes` — `{ positive: [], negative: [] }` verbatim quotes; used by Voices tab
- Backward-compat: `normalizeFindings()` in app.js converts old string-array `topFindings` to `[{text,severity}]`

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
- Header: title "Customer Sentiment Analysis" + tagline "Skim through your customer responses to find what really matters"; tagline hidden on report step via JS (`goToStep` toggles `.hidden` on `#header-tagline`); on screens ≤480px tagline is hidden via CSS (`display:none`)
- Footer: `© 2025 Customer Sentiment Analysis` — no "Powered by" attribution anywhere in the UI
- No "Powered by Claude" or "Powered by Claude Haiku" text anywhere — not in header, footer, or any visible UI element

## Responsive design (public/styles.css)
- Two breakpoints: `≤768px` (tablet) and `≤480px` (mobile/phone, including 375px iPhone)
- Tablet (≤768px): single-col analysis options, tighter padding, 2-col voice quotes grid, tab bar scrollable
- Mobile (≤480px): tagline hidden via CSS, step labels hidden, cards stack, metric cards single-col, action bar full-width stacked, report tab bar horizontally scrollable with `overflow-x: auto` and `-webkit-overflow-scrolling: touch`, presentation form single-col, all CTA buttons full-width
- Report tab bar NEVER wraps — tabs are `white-space: nowrap; flex-shrink: 0` with `overflow-x: auto` on parent

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

## Results page — tabbed layout (public/app.js + public/index.html + public/styles.css)

### Flow after analysis completes
1. `runAnalysis()` calls `renderReportTabs(json)`, `showActionBar()`, `showReportTabs()`
2. `showPresentationSection()` is NOT called automatically — only when user clicks "Generate Presentation" in the action bar

### Action bar (`#action-bar`)
- Hidden by default; revealed after analysis via `showActionBar()`
- Left: **Generate Presentation** (amber primary button) — triggers `showPresentationSection()`
- Right: **Export PDF**, **Plain Text**, **New Analysis** (ghost/outline buttons)
- `exportPDF()` temporarily adds `.pdf-visible` to all hidden tab panels so html2pdf captures all content, then removes it
- New Analysis resets wizard to step 1 and hides action bar + tabs container

### Tab container (`#report-tabs-container`)
- Hidden by default; revealed after analysis via `showReportTabs()`
- Meta row (`#report-tab-meta`): analysis type badge + source filename + timestamp
- Tab bar: 5 tabs with `role="tablist"`, `role="tab"`, `aria-selected`, `aria-controls`; arrow-key keyboard navigation via `initReportTabs()`
- `switchReportTab(tabId)` — updates `aria-selected`, `tabindex`, and panel `.active` class

### 5 tabs and their content
| Tab | ID | Content |
|---|---|---|
| Overview | `tab-panel-overview` | Executive summary (amber left-border block) + top findings (severity cards) + recommendations (numbered badges) |
| Themes | `tab-panel-themes` | Themes summary paragraph + theme cards grid (reuses `buildThemeCard()`); "not included" empty state for sentiment-only |
| Sentiment | `tab-panel-sentiment` | Score/breakdown bars (reuses `buildSentimentOverviewHTML()`) + drivers grid + emotional tone tag pills; "not included" for themes-only |
| Voices | `tab-panel-voices` | Notable quotes as cards (`voice-quote-card`); falls back to theme `exampleQuotes` for themes-only |
| Market | `tab-panel-market` | Exa market research (reuses `renderMarketResearch()`); friendly empty state if no EXA_API_KEY |

### Key helper functions (public/app.js)
- `renderReportTabs(report)` — main dispatcher; populates meta + calls all 5 tab renderers
- `buildTabSection(title, content, rawNode)` — wraps content in `.tab-section` with `.tab-section-label` + `::after` divider
- `tabEmpty(msg, sub)` — returns empty-state HTML (`.tab-empty` + `.tab-empty-sub`)
- `normalizeFindings(findings)` — backward-compat: converts `string[]` or `{text,severity}[]` → `{text,severity}[]`

### CSS components for results page (public/styles.css)
- `.action-bar` / `.action-bar-right` — flex layout, hidden by default
- `.report-tabs-container` / `.report-tab-bar-wrap` / `.report-tab-meta` — container + meta row
- `.report-tab` — amber active underline, `aria-selected` driven, focus-visible outline
- `.report-tab-panel` (`display:none`) / `.active` (`display:block`) / `.pdf-visible` (`display:block !important`)
- `.tab-section-label::after` — horizontal rule extending to right edge
- `.finding-card.finding-critical/moderate/info` — colored left border + matching dot
- `.rec-badge` — amber numbered circle
- `.tone-tags` / `.tone-tag` — purple pill badges
- `.voice-quotes-grid` / `.voice-quote-card` — quote cards with decorative `"` mark
- `.tab-empty` / `.tab-empty-sub` — centered empty state
- Full dark mode variants for all above; responsive overrides at ≤768px and ≤480px

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
- UI redesigned — white base, amber + purple accents, tabbed report with action bar
- Results page: tabbed interface (Overview / Themes / Sentiment / Voices / Market), metric cards, action bar
- Branding: "Customer Sentiment Analysis" throughout; no "Powered by Claude" anywhere; footer is "© 2025 Customer Sentiment Analysis"
- Fully responsive: tablet (≤768px) and mobile (≤480px / 375px iPhone) breakpoints
- GitHub repo live at github.com/sreeramkarthik-058/voc-intelligence
- Deployed: not yet — Phase 5 pending

## Remaining to do
- Deploy to web (Render or Railway)
