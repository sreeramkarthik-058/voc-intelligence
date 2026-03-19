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
- Phase 5 — Deployment (Render / Railway / Fly.io)

## Tech stack
- Frontend: HTML, CSS, vanilla JavaScript
- Backend: Node.js + Express
- AI: Anthropic Claude Haiku (`claude-haiku-4-5`) via `@anthropic-ai/sdk`
- Search: Exa web search via `exa-js` package
- PPT generation: `pptxgenjs` v4
- File parsing: `mammoth` (.docx), `csv-parse` (.csv), `multer` (upload)
- PDF export: `html2pdf.js` (CDN, client-side)

## Architecture
- `server.js` — Express server; registers both API route files
- `routes/analyze.js` — analysis route: Claude Haiku + optional Exa search
- `routes/presentation.js` — presentation agent: Claude Haiku → slide JSON → pptxgenjs → base64
- `utils/fileParser.js` — CSV and Word doc parsing
- `public/index.html` — frontend UI
- `public/app.js` — frontend logic (wizard, rendering, dark mode, metric cards, animations)
- `public/styles.css` — full design system with dark mode and animations

## Analysis route (routes/analyze.js)
- Accepts multipart form: `analysisType` (themes | sentiment | both) + `text` or `file`
- Calls Claude Haiku with a JSON-only prompt; parses structured response
- Exa search: called once per identified theme if `EXA_API_KEY` is set; non-fatal if missing
- Returns `{ success, analysisType, data, marketResearch, metadata }`

## Presentation agent (routes/presentation.js)
- POST `/api/presentation` — receives `{ report, instructions }`
- `summariseReport(report)` condenses the structured report to compact text — never passes raw feedback
- Calls Claude Haiku with a slide-structure prompt; Claude returns JSON `{ theme, style, slides[] }`
- `buildPptx(slides, theme)` renders slides via pptxgenjs v4 (13.33″ × 7.5″ LAYOUT_WIDE)
- Returns `{ success, slides, theme, style, totalSlides, pptxBase64 }`
- pptxgenjs requires hex colours WITHOUT the `#` prefix — use `hexColor(raw, fallback)` helper
- `express.json({ limit: '2mb' })` is required in server.js to handle the report payload

## Presentation agent rules
- Library: pptxgenjs v4
- These three slides are ALWAYS included, in this order:
  1. Title + key finding
  2. Problem statement
  3. Next steps + owners
- Number of slides: always ask the user — no default
- Presentation style: always ask the user — no default
- Colour theme: always ask the user — no default
- User describes preferences in plain English; Claude interprets and structures accordingly
- Every generated deck must be viewable in browser (view-only slide viewer)
- Every generated deck must be downloadable as a real .pptx file
- The .pptx must be editable in both PowerPoint and Google Slides

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
- Never make unnecessary API calls

## What Claude Code must never do
- Never change the model from `claude-haiku-4-5`
- Never modify the `.env` file
- Never call the presentation agent automatically
- Never use a hardcoded slide count or style
- Never commit API keys or secrets
- Never remove the `prefers-reduced-motion` guards on animations
- Never remove `aria-label` attributes from interactive elements
