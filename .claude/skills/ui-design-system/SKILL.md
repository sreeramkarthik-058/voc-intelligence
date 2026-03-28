---
name: ui-design-system
description: Design system rules for the UNFILTERED frontend. Use when working on public/styles.css, public/hero.css, public/index.html, public/app.js, or any UI/styling changes.
---

# UI design system

## Visual identity

- Dark-only theme — no light/dark toggle
- Page bg: #0A0A1A (deep dark); Card bg: #1A1A2E; borders: 1.5px #2D2D4E; border-radius: 12px
- Indigo #6366F1 — all primary actions (buttons, active states, accents)
- Cyan #06B6D4 — secondary actions, highlights
- Logo: speech bubble SVG icon in an amber-to-purple gradient 34px rounded square
- Typography: DM Sans; 0.9rem base, line-height 1.65
- Section labels: 0.72rem uppercase + horizontal divider extending right
- Outer padding: 28px; inner card padding: 20px

## Hero section

- Falling speech bubbles background — 8 cards, left/right edges only, CSS-only animation (no JS)
- Bubbles hidden on `prefers-reduced-motion`; 2 hidden at ≤768px, 4 hidden at ≤480px
- Cursor glow follows mouse inside hero section; hidden on touch/reduced-motion
- Sticky header bar (`.hero-bar`): `position: sticky; top: 0; z-index: 50` — stays visible when scrolling through report
- Header contains: speech bubble logo + "UNFILTERED" brand name + "by Sreeram" · "Feedback? Tell me" pill link · LinkedIn + GitHub social icons
- Content disclaimer below textarea: "By using this tool, you confirm the feedback contains no sensitive personal data or inappropriate content."
- Bottom quip: "Less time drowning in feedback. More time acting on it."

## Branding rules

- Brand name displayed as "UNFILTERED" (all caps) everywhere in the UI
- Footer: "© 2026 UNFILTERED · Built by a PM. Backlog? Still infinite."
- No "Powered by Claude" or "Powered by Claude Haiku" text anywhere

## Responsive breakpoints

- ≤768px (tablet): single-col analysis options, tighter padding, 2-col voice quotes, scrollable tab bar
- ≤480px (mobile/375px iPhone): step labels hidden, cards stack, metric cards single-col, action bar full-width stacked, tab bar horizontally scrollable with overflow-x: auto, all CTAs full-width
- Report tab bar NEVER wraps — tabs: white-space: nowrap; flex-shrink: 0; overflow-x: auto on parent

## Animations (all wrapped in prefers-reduced-motion)

- fadeUp — report sections fade + translate on render
- accentPulse — primary button glow on idle
- barGrow — sentiment bars animate from 0 to value
- countUp — JS requestAnimationFrame on 3 metric cards
- bubbleFall1/2/3 — speech bubble falling animation (hero section)

## Accessibility (WCAG AA)

- All interactive elements: aria-label, type="button", min-height: 44px
- Focus: :focus-visible 2px accent outline, offset 3px
- ARIA roles: tabs (role="tab", aria-selected, aria-controls), alert (role="alert"), loading (aria-live)
- No colour-only information: all badges/states have text labels

## Results page — tabbed layout

4 tabs: Overview | Themes | Sentiment | Voices

Action bar: hidden by default; revealed after analysis. Left: "Generate Presentation" (accent). Right: Export PDF, Plain Text, New Analysis (ghost buttons).

## Key UI functions (app.js)

- `renderReportTabs(report)` — main dispatcher
- `buildTabSection(title, content, rawNode)` — wraps content with section label + divider
- `tabEmpty(msg, sub)` — empty state HTML
- `normalizeFindings(findings)` — backward-compat for topFindings format
- `renderSlide(index)` — in-browser slide viewer (switch on slide.type)
- `tc(name, theme)` — resolves semantic color to #hex CSS string
- `isThemeDark(theme)` — checks bgColor luminance

## Metric cards

Three cards: Sentiment Score (accent), Negative % (red), Themes Found (cyan). Displays "N/A" when metric not applicable. Count-up animation via `countUp(el, target, duration)`.

## Presentation form UI

- Slide count: 4/6/8/10/12 (default 6)
- Focus: Executive summary / Detailed analysis / Problem & action plan / Custom
- Theme picker: Futuristic Dark / Futuristic Light / Upload Template
- Template upload: drag-and-drop; POST to /api/template/extract; shows swatches on success
- Guard: if "Upload Template" selected but no file extracted, shows error and blocks generation
