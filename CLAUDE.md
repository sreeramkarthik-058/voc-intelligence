# Unfiltered

AI-powered customer feedback analysis tool. Branded as "Unfiltered — raw customer truth, no sugar coating." Built by @nocodepm (Sreeram Karthik Sonti). Paste text or upload CSV/Word docs → Claude Haiku analyzes themes & sentiment → Exa searches market context → generates downloadable .pptx executive presentations.

## Tech stack

Frontend: HTML, CSS, vanilla JS · Backend: Node.js + Express · AI: Claude Haiku (claude-haiku-4-5) via @anthropic-ai/sdk · Search: exa-js · PPTX: pptxgenjs v4 · File parsing: mammoth, csv-parse, multer · Template parsing: adm-zip + fast-xml-parser · PDF export: html2pdf.js (CDN, client-side)

## Architecture

- `server.js` — Express server; registers API route files
- `routes/analyze.js` — analysis route (Claude Haiku + optional Exa)
- `routes/presentation.js` — presentation agent + template extraction
- `utils/fileParser.js` — CSV and Word parsing
- `utils/templateParser.js` — extracts theme from .pptx
- `public/index.html` — frontend UI
- `public/app.js` — frontend logic (wizard, tabs, dark mode, slide viewer)
- `public/styles.css` — design system with dark mode

## IMPORTANT: Rules Claude Code must always follow

- ALWAYS use model `claude-haiku-4-5` — NEVER Sonnet or Opus
- NEVER modify the `.env` file
- NEVER commit API keys or secrets
- NEVER call the presentation agent automatically — only on user click
- NEVER use `addImage()` for text content in pptxgenjs — use `addText()`
- NEVER pass raw feedback to the presentation agent — always `summariseReport()` first
- NEVER remove `prefers-reduced-motion` guards on animations
- NEVER remove `aria-label` attributes from interactive elements
- All pptxgenjs colors: 6-char hex WITHOUT `#` prefix — use `hexColor()` helper
- No "Powered by Claude" text anywhere in the UI

## Code style

- No frameworks — vanilla HTML/CSS/JS on the frontend
- Express routes go in `routes/`; utility modules go in `utils/`
- All AI prompts must return JSON only (no markdown fences)
- Keep responsive breakpoints: ≤768px (tablet) and ≤480px (mobile)

## Commands

- `npm install` — install dependencies
- `npm start` or `node server.js` — run the server
- No test suite yet

## Detailed specs

For full details on specific subsystems, see the skill files in `.claude/skills/`:
- Presentation rendering rules: @.claude/skills/presentation-agent/SKILL.md
- UI design system: @.claude/skills/ui-design-system/SKILL.md
- Analysis route & AI prompts: @.claude/skills/analysis-route/SKILL.md