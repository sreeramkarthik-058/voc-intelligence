---
name: presentation-agent
description: Rules for the pptxgenjs presentation generation system. Use when working on routes/presentation.js, slide rendering, theme system, template parsing, or anything related to .pptx output.
---

# Presentation agent

## Route: POST /api/presentation

Receives `{ report, instructions, customTheme? }`. `summariseReport(report)` condenses the structured report to compact text — never passes raw feedback. Numeric values are labelled (SENTIMENT_SCORE:, POSITIVE_PCT:, etc.) so Claude maps them to stat cards. Calls Claude Haiku with slide-structure prompt; returns JSON `{ theme, style, slides[] }`. `customTheme` (from uploaded template) overrides Claude's theme choice. `buildPptx(slides, theme)` renders via pptxgenjs v4 (13.33" × 7.5" LAYOUT_WIDE). Returns `{ success, slides, theme, style, totalSlides, pptxBase64 }`.

`express.json({ limit: '2mb' })` is required in server.js for the report payload.

## Template extraction: POST /api/template/extract

Accepts multipart .pptx via multer memory storage. Calls `extractThemeFromPptx(buffer)` from utils/templateParser.js. Returns `{ success, theme }`. Validates: must be .pptx; 20 MB limit. Errors: 400 (no file / wrong type), 422 (parse failure).

## Template parser (utils/templateParser.js)

Accepts .pptx buffer → adm-zip → reads `ppt/theme/theme1.xml` → fast-xml-parser parses `<a:clrScheme>` (handles both srgbClr and sysClr lastClr). Extracts: dk1, lt1, dk2, lt2, accent1–accent6. Font from `<a:fontScheme>` minor font; falls back to Calibri if non-standard. Safe fonts: Calibri, Arial, Segoe UI, Helvetica, Times New Roman, Georgia, Verdana, Trebuchet MS. Detects dark/light by computing relative luminance of lt1. Returns theme object with: name, bgColor, accentColor, secondaryAccent, textColor, mutedText, cardBg, cardBorder, positiveColor, negativeColor, neutralColor, fontFace.

## 8 slide types

| Type | Key rules |
|------|-----------|
| title | dark bg, 44pt title, 18pt subtitle, accent phrase, decorative line |
| stats | up to 4 stat cards (roundRect, left accent stripe, 36pt colored value, 11pt muted label), insight line |
| bullets | up to 4 bullet rows (ellipse dot + 16pt text), optional footnote; NO pptxgenjs bullet feature |
| comparison | two equal cards, colored header bands (accent / secondaryAccent), dot + item rows |
| bar_chart | horizontal bars as addShape('roundRect') rectangles (track + fill); fully editable |
| timeline | circle nodes on horizontal spine, phase/action/owner text per step |
| quote | decorative " mark, 22pt italic quote, sentiment dot, attribution |
| section_divider | accent lines above/below, 36pt centered title, 16pt muted subtitle |

## Futuristic theme system

All colors via theme object; `buildColors(theme)` maps to `c` dict. `resolveColor(name, c)` maps semantic names ("positive", "negative", "neutral", "accent", "secondary") throughout all renderers.

**Futuristic Dark** (default): bgColor 0A0A1A, accentColor 6366F1, secondaryAccent 06B6D4, textColor FFFFFF, mutedText 9CA3AF, cardBg 1A1A2E, cardBorder 2D2D4E, positiveColor 22C55E, negativeColor EF4444, neutralColor EAB308, fontFace Calibri

**Futuristic Light**: bgColor F8FAFC, accentColor 6366F1, secondaryAccent 0EA5E9, textColor 0F172A, mutedText 64748B, cardBg FFFFFF, cardBorder E2E8F0, positiveColor 16A34A, negativeColor DC2626, neutralColor CA8A04, fontFace Calibri

## Editability rules (critical)

- NEVER use addImage() for text content — all text must be addText()
- Every text element is its own addText() call — independently selectable in PowerPoint
- Shapes use addShape() — rectangles, circles, all decorative elements
- Bar charts are addShape('roundRect') — each bar individually resizable
- rectRadius: keep 0.05–0.2 for Google Slides compatibility
- Transparency below 10% on shapes renders inconsistently in Google Slides
- All colors: 6-char hex WITHOUT # prefix — use hexColor(raw, fallback) helper