# Presentation Agent Upgrade Spec

## For: VoC Intelligence Tool — `routes/presentation.js` + `public/app.js`
## Purpose: Give this to Claude Code as the instruction set for upgrading your presentation agent

---

## Overview

The current presentation agent generates boring, text-heavy slides with dated styling (blue header bars, white backgrounds, red footers, bullet-dump layouts). We're upgrading it to produce **startup-quality, futuristic decks** with two modes:

1. **Default futuristic theme** — dark backgrounds, gradient accents, data-as-visuals, minimal text
2. **User-uploaded template mode** — user uploads a .pptx template, agent extracts theme (colors, fonts, layout cues) and generates content in that style

All generated .pptx files MUST remain fully editable in Microsoft PowerPoint and Google Slides. Every text box, shape, and chart element must be a native pptxgenjs object — never flattened images.

---

## PART 1: AI PROMPT REWRITE (routes/presentation.js)

### Current problem
The Claude Haiku prompt lets the AI dump paragraphs of text per slide. There are no constraints on word count, layout type, or data visualization.

### New system prompt for the presentation agent

Replace the existing Claude Haiku system prompt with this structure. The prompt should instruct the AI to return JSON in this exact format:

```json
{
  "theme": {
    "name": "futuristic_dark",
    "bgColor": "0A0A1A",
    "bgGradient": { "from": "0A0A1A", "to": "12122A" },
    "accentGradient": ["6366F1", "06B6D4"],
    "accentColor": "6366F1",
    "secondaryAccent": "06B6D4",
    "textColor": "FFFFFF",
    "mutedText": "9CA3AF",
    "cardBg": "FFFFFF0F",
    "cardBorder": "FFFFFF1A",
    "positiveColor": "22C55E",
    "negativeColor": "EF4444",
    "neutralColor": "EAB308",
    "fontFace": "Calibri"
  },
  "slides": [
    {
      "type": "title",
      "title": "Short punchy title",
      "subtitle": "One line context",
      "accent": "key number or phrase to highlight"
    },
    {
      "type": "stats",
      "title": "Section label",
      "stats": [
        { "value": "35%", "label": "Positive", "color": "positive" },
        { "value": "40%", "label": "Negative", "color": "negative" },
        { "value": "25%", "label": "Neutral", "color": "neutral" }
      ],
      "insight": "One sentence takeaway"
    },
    {
      "type": "bullets",
      "title": "Section title",
      "points": [
        { "icon": "red_dot", "text": "Max 10 words per point" },
        { "icon": "yellow_dot", "text": "Max 10 words per point" },
        { "icon": "purple_dot", "text": "Max 10 words per point" }
      ],
      "note": "Optional one-line footnote"
    },
    {
      "type": "comparison",
      "title": "Section title",
      "left": { "label": "Strengths", "items": ["Item 1", "Item 2", "Item 3"] },
      "right": { "label": "Weaknesses", "items": ["Item 1", "Item 2", "Item 3"] }
    },
    {
      "type": "bar_chart",
      "title": "Section title",
      "bars": [
        { "label": "Category", "value": 75, "color": "accent" },
        { "label": "Category", "value": 45, "color": "secondary" }
      ],
      "yAxisLabel": "Percentage"
    },
    {
      "type": "timeline",
      "title": "Roadmap / Next Steps",
      "steps": [
        { "phase": "Now", "action": "Fix mobile crashes", "owner": "Engineering" },
        { "phase": "Q2", "action": "Revamp onboarding", "owner": "Product" },
        { "phase": "Q3", "action": "Launch roadmap portal", "owner": "Product" }
      ]
    },
    {
      "type": "quote",
      "quote": "Direct customer quote here",
      "attribution": "Customer role / segment",
      "sentiment": "positive | negative | neutral"
    },
    {
      "type": "section_divider",
      "title": "Big bold section title",
      "subtitle": "Optional context line"
    }
  ]
}
```

### Prompt rules to enforce (add these to the system prompt)

```
SLIDE CONTENT RULES — STRICTLY ENFORCE:
1. Title slides: max 6 words in title, max 12 words in subtitle
2. Bullet slides: max 4 bullets, max 10 words per bullet
3. Stats slides: max 4 stat cards per slide
4. NEVER put a paragraph of text on any slide
5. Every slide with data MUST use stats cards, bar_chart, or comparison — never text
6. Extract every number from the analysis into a stat card or chart
7. The first slide is ALWAYS type "title"
8. The last slide is ALWAYS type "timeline" with next steps
9. Use "section_divider" between major topic shifts
10. Include at least one "quote" slide if customer quotes exist in the data
11. Prefer visuals over text: if something can be a chart, make it a chart
12. Each slide should communicate ONE idea only
```

---

## PART 2: PPTXGENJS RENDERING OVERHAUL (routes/presentation.js)

### Default futuristic theme — rendering rules

For each slide type in the JSON above, here's exactly how to render it with pptxgenjs. All colors are hex WITHOUT the # prefix (pptxgenjs requirement).

#### Global slide setup
```javascript
// Every slide gets this background
slide.background = { fill: theme.bgColor };

// Or for gradient backgrounds (preferred):
slide.background = {
  fill: { type: 'solid', color: theme.bgColor }
};

// Slide dimensions (already set in your code)
// LAYOUT_WIDE: 13.33" x 7.5"
```

#### Slide type: "title"
```
- Background: solid dark (0A0A1A)
- Title: 44pt, bold, white, centered vertically at 35% from top
- Subtitle: 18pt, muted gray (9CA3AF), centered, below title
- Accent phrase: if provided, render in gradient-simulated style
  (since pptxgenjs doesn't support text gradients, use the accentColor for the key phrase)
- Add a subtle decorative shape: a thin horizontal line (2px) in accentColor
  at 80% width, centered, below the subtitle
- Optional: add a small translucent rounded rectangle in top-right corner
  as a decorative element (fill: accentColor, opacity: 8%)
```

#### Slide type: "stats"
```
- Section label: 10pt, uppercase, muted gray, top-left, letter-spacing wide
- Stats rendered as CARD BLOCKS arranged horizontally:
  - Each card: rounded rectangle (rectRadius: 0.15), fill cardBg (FFFFFF0F)
  - Left border accent: thin rectangle (0.06" wide) in the stat's color
  - Value text: 36pt, bold, colored per stat.color mapping
  - Label text: 11pt, muted gray, below value
  - Cards evenly spaced across slide width with 0.3" gaps
- Insight line: 13pt, muted gray, bottom of slide, centered
```

#### Slide type: "bullets"
```
- Title: 24pt, white, bold, top area
- Each bullet point rendered as a ROW (not a text bullet):
  - Colored dot: small circle shape (0.12" diameter) in the icon color
  - Text: 16pt, white, to the right of the dot
  - Each row spaced 0.7" apart vertically
- Note: 11pt, muted gray, bottom
- DO NOT use pptxgenjs bullet feature (it looks dated)
- Instead, manually position circle shapes + text boxes per row
```

#### Slide type: "comparison"
```
- Title: 24pt, white, bold, top
- Two columns, each in a rounded rectangle card (cardBg fill)
- Left card: header in accentColor, items as clean rows
- Right card: header in secondaryAccent, items as clean rows
- Cards should have equal width with 0.4" gap between them
- Each item: 14pt, white, with a small dot indicator
```

#### Slide type: "bar_chart"
```
- Title: 24pt, white, bold, top
- DO NOT use pptxgenjs chart feature (limited styling control)
- Instead, render bars as RECTANGLES manually:
  - Each bar: rounded rectangle, filled with accent/secondary color
  - Bar width proportional to value (calculate from max value)
  - Horizontal layout (bars go left to right)
  - Value label: bold, at the end of each bar
  - Category label: muted gray, below each bar
- This gives full visual control and stays editable
```

#### Slide type: "timeline"
```
- Title: 24pt, white, bold, top
- Horizontal timeline line: thin rectangle across the slide (2px height, muted color)
- Each step: 
  - Circle node on the timeline line (0.25" diameter, accentColor fill)
  - Phase label: 12pt, bold, accentColor, above the node
  - Action text: 14pt, white, below the node
  - Owner text: 11pt, muted gray, below action
- Steps evenly distributed along the timeline
```

#### Slide type: "quote"
```
- Large quotation mark: 72pt, accentColor, opacity 20%, top-left decorative
- Quote text: 22pt, white, italic, centered with generous padding
- Attribution: 13pt, muted gray, below quote, right-aligned
- Sentiment indicator: small colored dot next to attribution
  (green for positive, red for negative, yellow for neutral)
```

#### Slide type: "section_divider"
```
- Title: 36pt, white, bold, centered vertically
- Subtitle: 16pt, muted gray, centered, below title
- Decorative: thin accent line above and below the title block
- Background can have a very subtle gradient overlay
```

### Slide numbering
```
- Every slide except the title slide gets a slide number
- Position: bottom-right corner
- Format: "2 / 8" style
- Size: 9pt, muted gray (opacity ~40%)
```

---

## PART 3: TEMPLATE UPLOAD FEATURE

### How it works (user flow)

1. User clicks "Upload Template" button in the UI (new button in the presentation generation section)
2. User selects a .pptx file from their computer
3. Backend extracts theme information from the template:
   - Background colors from slide masters/layouts
   - Accent colors from the theme XML
   - Font faces from the theme
   - Any logo images from slide masters
4. The extracted theme overrides the default futuristic theme
5. Claude Haiku still generates the same slide JSON structure
6. pptxgenjs renders using the extracted theme colors/fonts instead of defaults

### Backend implementation (new route or addition to presentation.js)

Create a new utility: `utils/templateParser.js`

```javascript
// What this file does:
// 1. Accepts a .pptx file buffer
// 2. Unzips it (pptx files are ZIP archives)
// 3. Reads ppt/theme/theme1.xml for colors and fonts
// 4. Reads ppt/slideMasters/slideMaster1.xml for background
// 5. Returns a theme object in the same format as the default theme

// Dependencies needed:
// - adm-zip (for unzipping pptx) — install with: npm install adm-zip
// - xml2js or fast-xml-parser (for parsing XML) — install with: npm install fast-xml-parser

// The theme XML location in a .pptx:
// ppt/theme/theme1.xml contains <a:clrScheme> with:
//   - dk1 (dark 1 — usually black)
//   - lt1 (light 1 — usually white)  
//   - dk2 (dark 2)
//   - lt2 (light 2)
//   - accent1 through accent6
//   - hlink (hyperlink color)
//   - folHlink (followed hyperlink color)
//
// Font info is in <a:fontScheme> with majorFont and minorFont
//
// The function should return:
// {
//   bgColor: extracted from dk1 or slide master background,
//   accentColor: extracted from accent1,
//   secondaryAccent: extracted from accent2,
//   textColor: extracted from lt1,
//   mutedText: derived (lighten dk2 or use lt2),
//   fontFace: extracted from minorFont latin typeface,
//   // ... map to same theme object structure
// }
```

### Frontend changes (public/index.html + public/app.js)

Add to the presentation generation section of the UI:

```
- New toggle or tab: "Use default theme" vs "Upload your template"
- If "Upload your template" is selected:
  - Show a file upload dropzone (accepts .pptx only)
  - Show a preview of extracted colors after upload (small color swatches)
  - Show the extracted font name
  - User can then proceed to generate presentation as normal
- The uploaded template file is sent to the backend via multipart form
- Backend extracts theme, returns theme object to frontend
- Frontend sends theme object along with the presentation generation request
```

### API changes

New endpoint:
```
POST /api/template/extract
- Accepts: multipart form with .pptx file
- Returns: { success: true, theme: { ...extracted theme object } }
```

Modified existing endpoint:
```
POST /api/presentation
- Now also accepts optional "customTheme" in the request body
- If customTheme is provided, use it instead of the default futuristic theme
- If not provided, use the default futuristic theme
```

---

## PART 4: EDITABILITY REQUIREMENTS

These are critical — every element must be editable when opened in PowerPoint or Google Slides.

### Rules for pptxgenjs rendering

1. **NEVER use slide.addImage() for text content** — all text must be addText() or addShape() with text
2. **Every text element must be its own addText() call** — this makes each one independently selectable and editable
3. **Shapes (rectangles, circles) must use addShape()** — not addImage()
4. **Bar charts rendered as rectangles** — each bar is an addShape('rect') call, making them individually resizable and recolorable
5. **Stat cards** — each card is an addShape('roundRect') with separate addText() calls for value and label
6. **Timeline nodes** — each circle is addShape('ellipse'), each label is addText()
7. **Colors must use hex WITHOUT # prefix** — pptxgenjs requirement
8. **All fonts must be commonly available** — Calibri (default), Arial, or Segoe UI. Never use custom/web fonts that won't render in PowerPoint
9. **Text boxes should have generous sizing** — slightly larger than needed so users can edit without overflow issues

### Google Slides compatibility notes

- Avoid transparency/opacity below 10% on shapes (renders inconsistently)
- Use solid fills where possible; gradient fills may not transfer perfectly
- Round rectangle radius (rectRadius) is supported but keep it subtle (0.1-0.2)
- Font substitution: Calibri → Google's equivalent is fine; avoid obscure fonts

---

## PART 5: UI CHANGES FOR PRESENTATION SECTION

### Updated presentation generation flow

```
Current flow:
1. User clicks "Generate Presentation"
2. Modal asks: number of slides, style, color theme (text inputs)
3. Agent generates

New flow:
1. User clicks "Generate Presentation"
2. Modal shows:
   a. Number of slides (dropdown: 4, 6, 8, 10, 12)
   b. Theme selection:
      - "Futuristic Dark" (default, selected) — shows preview swatch
      - "Futuristic Light" — dark text on light bg variant
      - "Upload your template" — shows file upload zone
   c. Presentation focus (dropdown):
      - "Executive summary"
      - "Detailed analysis"
      - "Problem & action plan"
      - "Custom" (free text field appears)
   d. Any special instructions (optional text area)
3. Generate button
```

### In-browser slide viewer updates

The existing slide viewer should be updated to render the new futuristic theme properly:
- Dark background slides need dark viewer background
- Stats cards should render as visual blocks (not just text)
- The viewer is view-only — it's a preview, the real output is the .pptx download

---

## PART 6: DEFAULT COLOR THEMES

### Futuristic Dark (default)
```
Background: 0A0A1A (near-black with blue tint)
Card background: FFFFFF with 6% opacity (translucent white)
Card border: FFFFFF with 10% opacity
Primary accent: 6366F1 (indigo/purple)
Secondary accent: 06B6D4 (cyan)
Text: FFFFFF (white)
Muted text: 9CA3AF (gray)
Positive: 22C55E (green)
Negative: EF4444 (red)
Neutral/Warning: EAB308 (yellow)
Font: Calibri
```

### Futuristic Light (alternative)
```
Background: F8FAFC (cool white)
Card background: FFFFFF
Card border: E2E8F0
Primary accent: 6366F1 (indigo)
Secondary accent: 0EA5E9 (blue)
Text: 0F172A (near-black)
Muted text: 64748B (slate gray)  
Positive: 16A34A (green)
Negative: DC2626 (red)
Neutral/Warning: CA8A04 (amber)
Font: Calibri
```

---

## IMPLEMENTATION ORDER

Tell Claude Code to implement in this order:

1. **First: Rewrite the AI prompt** in routes/presentation.js — change the system prompt so Claude Haiku outputs the new JSON structure with slide types and content rules
2. **Second: Build the rendering functions** — one function per slide type (renderTitleSlide, renderStatsSlide, renderBulletsSlide, etc.)
3. **Third: Update the theme system** — replace hardcoded colors with the theme object
4. **Fourth: Build template parser** — utils/templateParser.js + POST /api/template/extract
5. **Fifth: Update the UI** — new modal flow, template upload, theme selection
6. **Sixth: Update the in-browser viewer** — make it render the new slide styles properly
7. **Last: Test end-to-end** — generate a deck, view in browser, download, open in PowerPoint, open in Google Slides, verify everything is editable

---

## HOW TO USE THIS SPEC WITH CLAUDE CODE

Copy this entire document. In Claude Code, say:

"I need to upgrade my presentation agent. Here is the full spec. Please start with step 1 (rewriting the AI prompt in routes/presentation.js). Read my current code first, then make the changes according to the spec."

Then after each step is done, say:

"Step 1 is done. Now do step 2 according to the spec."

Go one step at a time. Test after each step if possible.

---

## RULES THAT STILL APPLY (from CLAUDE.md)

- Always use Claude Haiku (claude-haiku-4-5) — NEVER Sonnet or Opus
- Never modify the .env file
- Never call the presentation agent automatically
- Never use hardcoded slide count or style (always ask user)
- Never commit API keys
- hexColor(raw, fallback) helper must be used for all color values in pptxgenjs
- express.json({ limit: '2mb' }) must remain in server.js
