---
name: ui-design-system
description: Design system rules for the Customer Sentiment Analysis frontend. Use when working on public/styles.css, public/index.html, public/app.js, or any UI/styling changes.
---

# UI design system

## Visual identity

- Page bg: #F8F7F4 (warm off-white)
- Card bg: #FFFFFF; borders: 1.5px #E5E7EB; border-radius: 12px
- Amber #D97706 — all primary actions (buttons, active states, accents)
- Purple #7C3AED — themes, tags, secondary actions
- Logo: amber-to-purple gradient 36px rounded square
- Typography: 0.9rem base (~14.4px), line-height 1.65 (~24px)
- Section labels: 0.72rem uppercase + horizontal divider extending right
- Outer padding: 28px; inner card padding: 20px

## Dark mode

Toggled via header button. Stored in localStorage. Respects prefers-color-scheme on first load. Applied via `[data-theme="dark"]` on `<html>`. Dark bg: #1A1A1A.

## Branding rules

- Header: "Customer Sentiment Analysis" + tagline "Skim through your customer responses to find what really matters"
- Tagline hidden on report step via JS (goToStep toggles .hidden on #header-tagline)
- Footer: "© 2025 Customer Sentiment Analysis" — no "Powered by" attribution anywhere
- No "Powered by Claude" or "Powered by Claude Haiku" text anywhere

## Responsive breakpoints

- ≤768px (tablet): single-col analysis options, tighter padding, 2-col voice quotes, scrollable tab bar
- ≤480px (mobile/375px iPhone): tagline hidden via CSS, step labels hidden, cards stack, metric cards single-col, action bar full-width stacked, tab bar horizontally scrollable with overflow-x: auto, all CTAs full-width
- Report tab bar NEVER wraps — tabs: white-space: nowrap; flex-shrink: 0; overflow-x: auto on parent

## Animations (all wrapped in prefers-reduced-motion)

- fadeUp — report sections fade + translate on render
- amberPulse — primary button glow on idle
- barGrow — sentiment bars animate from 0 to value
- countUp — JS requestAnimationFrame on 3 metric cards

## Accessibility (WCAG AA)

- All interactive elements: aria-label, type="button", min-height: 44px
- Focus: :focus-visible 2px amber outline, offset 3px
- ARIA roles: tabs (role="tab", aria-selected, aria-controls), alert (role="alert"), loading (aria-live)
- No colour-only information: all badges/states have text labels

## Results page — tabbed layout

5 tabs: Overview | Themes | Sentiment | Voices | Market

Action bar: hidden by default; revealed after analysis. Left: "Generate Presentation" (amber). Right: Export PDF, Plain Text, New Analysis (ghost buttons).

## Key UI functions (app.js)

- `renderReportTabs(report)` — main dispatcher
- `buildTabSection(title, content, rawNode)` — wraps content with section label + divider
- `tabEmpty(msg, sub)` — empty state HTML
- `normalizeFindings(findings)` — backward-compat for topFindings format
- `renderSlide(index)` — in-browser slide viewer (switch on slide.type)
- `tc(name, theme)` — resolves semantic color to #hex CSS string
- `isThemeDark(theme)` — checks bgColor luminance

## Metric cards

Three cards: Sentiment Score (amber), Negative % (red), Themes Found (purple). Displays "N/A" when metric not applicable. Count-up animation via `countUp(el, target, duration)`.

## Presentation form UI

- Slide count: 4/6/8/10/12 (default 6)
- Focus: Executive summary / Detailed analysis / Problem & action plan / Custom
- Theme picker: Futuristic Dark / Futuristic Light / Upload Template
- Template upload: drag-and-drop; POST to /api/template/extract; shows swatches on success
- Guard: if "Upload Template" selected but no file extracted, shows error and blocks generation