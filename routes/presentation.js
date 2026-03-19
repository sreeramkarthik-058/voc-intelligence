/* ═══════════════════════════════════════════════════════════════
   Presentation Agent — routes/presentation.js
   Receives structured report + user format instructions.
   Calls Claude Haiku to structure slides, then generates .pptx
   with pptxgenjs. Returns slides JSON + base64 .pptx.
   ═══════════════════════════════════════════════════════════════ */

const express = require('express');
const multer  = require('multer');
const Anthropic = require('@anthropic-ai/sdk');
const PptxGenJS = require('pptxgenjs');
const { extractThemeFromPptx } = require('../utils/templateParser');

const client  = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const router  = express.Router();
const upload  = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ─── Summarise structured report for Claude ───────────────────────────────────
// Per CLAUDE.md: pass structured report to the agent — never raw feedback.
// Numeric values are labelled explicitly so the AI can map them to stat cards / charts.

function summariseReport(report) {
  const { analysisType, data } = report;
  const lines = [];

  if (analysisType === 'both') {
    if (data.executiveSummary) lines.push(`EXECUTIVE SUMMARY: ${data.executiveSummary}`);

    if (data.sentiment) {
      const s = data.sentiment;
      lines.push('\n[NUMERIC DATA — use in stat cards / charts]');
      if (s.overall) {
        lines.push(`  SENTIMENT_SCORE: ${s.overall.score}/10 (${s.overall.label})`);
        if (s.overall.description) lines.push(`  Sentiment description: ${s.overall.description}`);
      }
      const b = s.breakdown;
      if (b) {
        lines.push(`  POSITIVE_PCT: ${b.positive}%`);
        lines.push(`  NEGATIVE_PCT: ${b.negative}%`);
        lines.push(`  NEUTRAL_PCT:  ${b.neutral}%`);
      }
      if (s.drivers) {
        lines.push(`  Positive drivers: ${(s.drivers.positive || []).join(', ')}`);
        lines.push(`  Negative drivers: ${(s.drivers.negative || []).join(', ')}`);
      }
      if (s.emotionalTone) {
        lines.push(`  Dominant emotion: ${s.emotionalTone.dominant}`);
        lines.push(`  Secondary emotion: ${s.emotionalTone.secondary}`);
      }
      if (s.notableQuotes?.positive?.length)
        lines.push(`  POSITIVE_QUOTE: "${s.notableQuotes.positive[0]}"`);
      if (s.notableQuotes?.negative?.length)
        lines.push(`  NEGATIVE_QUOTE: "${s.notableQuotes.negative[0]}"`);
    }

    if (data.themes) {
      lines.push('\n[THEMES]');
      lines.push(`  THEME_COUNT: ${(data.themes.list || []).length}`);
      (data.themes.list || []).forEach((t, i) => {
        lines.push(`  Theme ${i + 1}: ${t.name} [${t.frequency} frequency, ${t.sentiment} sentiment]`);
        lines.push(`    Description: ${t.description}`);
        if (t.keyInsights?.length) lines.push(`    Key insights: ${t.keyInsights.join(' | ')}`);
        if (t.exampleQuotes?.length) lines.push(`    Quote: "${t.exampleQuotes[0]}"`);
      });
      if (data.themes.topFindings?.length)
        lines.push(`\n[TOP FINDINGS]\n  ${data.themes.topFindings.map((f, i) => `${i + 1}. ${f}`).join('\n  ')}`);
      if (data.themes.recommendations?.length)
        lines.push(`\n[RECOMMENDATIONS]\n  ${data.themes.recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n  ')}`);
    }

  } else if (analysisType === 'themes') {
    if (data.summary) lines.push(`SUMMARY: ${data.summary}`);
    lines.push(`\n[NUMERIC DATA]\n  THEME_COUNT: ${(data.list || data.themes || []).length}`);
    lines.push('\n[THEMES]');
    (data.list || data.themes || []).forEach((t, i) => {
      lines.push(`  Theme ${i + 1}: ${t.name} [${t.frequency}, ${t.sentiment}]`);
      lines.push(`    Description: ${t.description}`);
      if (t.keyInsights?.length) lines.push(`    Key insights: ${t.keyInsights.join(' | ')}`);
      if (t.exampleQuotes?.length) lines.push(`    Quote: "${t.exampleQuotes[0]}"`);
    });
    if (data.topFindings?.length)
      lines.push(`\n[TOP FINDINGS]\n  ${data.topFindings.map((f, i) => `${i + 1}. ${f}`).join('\n  ')}`);
    if (data.recommendations?.length)
      lines.push(`\n[RECOMMENDATIONS]\n  ${data.recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n  ')}`);

  } else {
    // sentiment only
    if (data.summary) lines.push(`SUMMARY: ${data.summary}`);
    lines.push('\n[NUMERIC DATA — use in stat cards / charts]');
    if (data.overall) {
      lines.push(`  SENTIMENT_SCORE: ${data.overall.score}/10 (${data.overall.label})`);
      if (data.overall.description) lines.push(`  Sentiment description: ${data.overall.description}`);
    }
    const b = data.breakdown;
    if (b) {
      lines.push(`  POSITIVE_PCT: ${b.positive}%`);
      lines.push(`  NEGATIVE_PCT: ${b.negative}%`);
      lines.push(`  NEUTRAL_PCT:  ${b.neutral}%`);
    }
    if (data.drivers) {
      lines.push(`  Positive drivers: ${(data.drivers.positive || []).join(', ')}`);
      lines.push(`  Negative drivers: ${(data.drivers.negative || []).join(', ')}`);
    }
    if (data.emotionalTone) {
      lines.push(`  Dominant emotion: ${data.emotionalTone.dominant}`);
      lines.push(`  Secondary emotion: ${data.emotionalTone.secondary}`);
    }
    if (data.notableQuotes?.positive?.length)
      lines.push(`  POSITIVE_QUOTE: "${data.notableQuotes.positive[0]}"`);
    if (data.notableQuotes?.negative?.length)
      lines.push(`  NEGATIVE_QUOTE: "${data.notableQuotes.negative[0]}"`);
  }

  return lines.join('\n');
}

// ─── Claude prompt ────────────────────────────────────────────────────────────

function buildSlidePrompt(reportSummary, instructions) {
  return `You are a world-class presentation designer creating a startup-quality executive deck from a Voice of Customer (VoC) analysis report. Your output should look like it came from a top-tier design consultancy — data-driven, visual, minimal text.

USER INSTRUCTIONS: "${instructions}"

VoC ANALYSIS REPORT:
${reportSummary}

━━━ THEME SELECTION ━━━
Choose the theme based on user instructions:
- Default / no preference mentioned → use "futuristic_dark"
- User mentions "light", "white", "bright", "clean" → use "futuristic_light"
- User mentions specific colours → use "futuristic_dark" but update accentColor and secondaryAccent to match

Futuristic Dark palette:
  bgColor: "0A0A1A", accentColor: "6366F1", secondaryAccent: "06B6D4"
  textColor: "FFFFFF", mutedText: "9CA3AF", cardBg: "1A1A2E", cardBorder: "2D2D4E"
  positiveColor: "22C55E", negativeColor: "EF4444", neutralColor: "EAB308", fontFace: "Calibri"

Futuristic Light palette:
  bgColor: "F8FAFC", accentColor: "6366F1", secondaryAccent: "0EA5E9"
  textColor: "0F172A", mutedText: "64748B", cardBg: "FFFFFF", cardBorder: "E2E8F0"
  positiveColor: "16A34A", negativeColor: "DC2626", neutralColor: "CA8A04", fontFace: "Calibri"

━━━ SLIDE STRUCTURE RULES — MANDATORY ━━━
1. The FIRST slide MUST be type "title"
2. The LAST slide MUST be type "timeline" (next steps with owners)
3. Use "section_divider" between major topic shifts (e.g. between themes and sentiment sections)
4. Include at least one "quote" slide if customer quotes exist in the data
5. Parse the number of slides from user instructions — fit the content to that count

━━━ SLIDE CONTENT RULES — STRICTLY ENFORCE ━━━
1. Title slides: max 6 words in title, max 12 words in subtitle
2. Bullet slides: max 4 points, max 10 words per point
3. Stats slides: max 4 stat cards per slide
4. NEVER put a paragraph of text on any slide — ever
5. Any data that exists as a number MUST become a stats card or bar_chart — never plain text
6. Extract EVERY percentage, score, and count from the report into stat cards or charts
7. Prefer visuals over text: if something can be a chart or stat card, make it one
8. Each slide communicates ONE idea only — split complex ideas across two slides
9. Timeline steps: max 6 words per action, always include an owner

━━━ AVAILABLE SLIDE TYPES ━━━
- "title"           → deck opener: punchy headline, one-line context, key accent phrase
- "stats"           → numeric data as visual stat cards (use for sentiment scores, percentages)
- "bullets"         → max 4 points with colored dot icons (use for key findings, themes list)
- "comparison"      → two-column card layout (use for strengths vs. weaknesses, positive vs. negative)
- "bar_chart"       → horizontal bars for ranked data (use for theme frequency, category scores)
- "timeline"        → roadmap / next steps with phase labels and owners — ALWAYS the last slide
- "quote"           → single impactful verbatim customer quote
- "section_divider" → bold transition slide between major sections

━━━ RETURN FORMAT ━━━
Return ONLY a valid JSON object. No markdown. No code fences. No commentary. No text before or after the JSON.

{
  "theme": {
    "name": "futuristic_dark",
    "bgColor": "0A0A1A",
    "accentColor": "6366F1",
    "secondaryAccent": "06B6D4",
    "textColor": "FFFFFF",
    "mutedText": "9CA3AF",
    "cardBg": "1A1A2E",
    "cardBorder": "2D2D4E",
    "positiveColor": "22C55E",
    "negativeColor": "EF4444",
    "neutralColor": "EAB308",
    "fontFace": "Calibri"
  },
  "slides": [
    {
      "type": "title",
      "title": "Max 6 words",
      "subtitle": "One line context — max 12 words",
      "accent": "Key number or standout phrase"
    },
    {
      "type": "stats",
      "title": "Section label",
      "stats": [
        { "value": "7.2", "label": "Sentiment Score /10", "color": "positive" },
        { "value": "38%", "label": "Negative Feedback",   "color": "negative" },
        { "value": "25%", "label": "Neutral Feedback",    "color": "neutral"  }
      ],
      "insight": "One sentence takeaway from the numbers"
    },
    {
      "type": "bullets",
      "title": "Section title",
      "points": [
        { "icon": "accent",    "text": "Max 10 words per point" },
        { "icon": "secondary", "text": "Max 10 words per point" },
        { "icon": "negative",  "text": "Max 10 words per point" },
        { "icon": "positive",  "text": "Max 10 words per point" }
      ],
      "note": "Optional one-line footnote"
    },
    {
      "type": "comparison",
      "title": "Section title",
      "left":  { "label": "Strengths",  "items": ["Item 1", "Item 2", "Item 3"] },
      "right": { "label": "Weaknesses", "items": ["Item 1", "Item 2", "Item 3"] }
    },
    {
      "type": "bar_chart",
      "title": "Section title",
      "bars": [
        { "label": "Category A", "value": 75, "color": "accent"    },
        { "label": "Category B", "value": 60, "color": "secondary" },
        { "label": "Category C", "value": 45, "color": "neutral"   }
      ],
      "yAxisLabel": "Frequency %"
    },
    {
      "type": "quote",
      "quote": "Verbatim customer quote — real words only, do not paraphrase",
      "attribution": "Customer role or segment",
      "sentiment": "positive"
    },
    {
      "type": "section_divider",
      "title": "Bold section title",
      "subtitle": "Optional one-line context"
    },
    {
      "type": "timeline",
      "title": "Next Steps",
      "steps": [
        { "phase": "Now", "action": "Max 6 words",  "owner": "Team name" },
        { "phase": "Q2",  "action": "Max 6 words",  "owner": "Team name" },
        { "phase": "Q3",  "action": "Max 6 words",  "owner": "Team name" }
      ]
    }
  ]
}

Use only the slide types needed — not all types are required in every deck. Use real content from the report only — no placeholder text. The accent/color values in stat cards and bullet icons refer to theme color names: "positive", "negative", "neutral", "accent", "secondary".`;
}

// ─── Strip # and validate hex ─────────────────────────────────────────────────

function hexColor(raw, fallback) {
  if (!raw || typeof raw !== 'string') return fallback;
  const clean = raw.replace('#', '').trim();
  return /^[0-9A-Fa-f]{6}$/.test(clean) ? clean : fallback;
}

// ─── Theme color builder ───────────────────────────────────────────────────────

function buildColors(theme) {
  return {
    bg:        hexColor(theme.bgColor,        '0A0A1A'),
    accent:    hexColor(theme.accentColor,     '6366F1'),
    secondary: hexColor(theme.secondaryAccent, '06B6D4'),
    text:      hexColor(theme.textColor,       'FFFFFF'),
    muted:     hexColor(theme.mutedText,       '9CA3AF'),
    cardBg:    hexColor(theme.cardBg,          '1A1A2E'),
    cardBorder:hexColor(theme.cardBorder,      '2D2D4E'),
    positive:  hexColor(theme.positiveColor,   '22C55E'),
    negative:  hexColor(theme.negativeColor,   'EF4444'),
    neutral:   hexColor(theme.neutralColor,    'EAB308'),
    font:      (theme.fontFace && typeof theme.fontFace === 'string')
               ? theme.fontFace : 'Calibri',
  };
}

// ─── Resolve semantic color names to hex ──────────────────────────────────────

function resolveColor(name, c) {
  const map = {
    positive:  c.positive,
    negative:  c.negative,
    neutral:   c.neutral,
    accent:    c.accent,
    secondary: c.secondary,
    muted:     c.muted,
    text:      c.text,
  };
  return map[name] || c.accent;
}

// ─── Shared helpers ────────────────────────────────────────────────────────────

// Slide number badge — bottom-right, "N / T" format. Not shown on title slide.
function addSlideNumber(s, slideNum, total, c) {
  s.addText(`${slideNum} / ${total}`, {
    x: 12.2, y: 7.1, w: 1.0, h: 0.28,
    fontSize: 9, color: c.muted,
    fontFace: c.font, align: 'right', valign: 'middle',
  });
}

// ─── Title slide ───────────────────────────────────────────────────────────────
// Dark bg, large title, subtitle, accent phrase, thin decorative line.

function renderTitleSlide(pptx, s, slide, c) {
  s.background = { color: c.bg };

  // Top-right decorative rounded rect (translucent)
  s.addShape(pptx.ShapeType.roundRect, {
    x: 10.6, y: 0.1, w: 2.5, h: 2.0,
    fill: { color: c.accent, transparency: 88 },
    line: { type: 'none' },
    rectRadius: 0.1,
  });

  // Label (small caps above title)
  s.addText('CUSTOMER SENTIMENT ANALYSIS', {
    x: 0.75, y: 1.4, w: 9.5, h: 0.35,
    fontSize: 9, color: c.muted,
    fontFace: c.font, align: 'left',
    charSpacing: 3,
  });

  // Main title
  s.addText(slide.title || '', {
    x: 0.75, y: 1.85, w: 11.5, h: 1.9,
    fontSize: 44, bold: true, color: c.text,
    fontFace: c.font, align: 'left', valign: 'middle',
    wrap: true,
  });

  // Subtitle
  if (slide.subtitle) {
    s.addText(slide.subtitle, {
      x: 0.75, y: 3.9, w: 10.5, h: 0.85,
      fontSize: 18, color: c.muted,
      fontFace: c.font, align: 'left', valign: 'top',
      wrap: true,
    });
  }

  // Accent phrase (key stat or highlight)
  if (slide.accent) {
    s.addText(slide.accent, {
      x: 0.75, y: 4.9, w: 9.0, h: 0.6,
      fontSize: 15, bold: true, color: c.accent,
      fontFace: c.font, align: 'left',
    });
  }

  // Thin decorative line below accent phrase
  s.addShape(pptx.ShapeType.rect, {
    x: 0.75, y: 5.7, w: 10.0, h: 0.03,
    fill: { color: c.accent },
    line: { type: 'none' },
  });
}

// ─── Stats slide ───────────────────────────────────────────────────────────────
// Horizontal stat cards with left-stripe accent, large value, label, insight.

function renderStatsSlide(pptx, s, slide, c, slideNum, total) {
  s.background = { color: c.bg };

  // Section label
  s.addText((slide.title || '').toUpperCase(), {
    x: 0.6, y: 0.42, w: 12.0, h: 0.35,
    fontSize: 10, color: c.muted,
    fontFace: c.font, align: 'left',
    charSpacing: 2,
  });

  const stats = (slide.stats || []).slice(0, 4);
  const n = stats.length || 1;
  const margin = 0.6;
  const gap    = 0.3;
  const cardW  = (13.33 - margin * 2 - gap * (n - 1)) / n;
  const cardY  = 1.05;
  const cardH  = 4.55;

  stats.forEach((stat, i) => {
    const cardX    = margin + i * (cardW + gap);
    const statColor = resolveColor(stat.color, c);

    // Card body
    s.addShape(pptx.ShapeType.roundRect, {
      x: cardX, y: cardY, w: cardW, h: cardH,
      fill: { color: c.cardBg },
      line: { color: c.cardBorder, width: 1 },
      rectRadius: 0.06,
    });

    // Left accent stripe
    s.addShape(pptx.ShapeType.rect, {
      x: cardX, y: cardY, w: 0.07, h: cardH,
      fill: { color: statColor },
      line: { type: 'none' },
    });

    // Value (large, colored)
    s.addText(String(stat.value ?? ''), {
      x: cardX + 0.22, y: cardY + 0.65, w: cardW - 0.3, h: 1.7,
      fontSize: 36, bold: true, color: statColor,
      fontFace: c.font, align: 'left', valign: 'middle',
    });

    // Label
    s.addText(stat.label || '', {
      x: cardX + 0.22, y: cardY + 2.65, w: cardW - 0.3, h: 0.85,
      fontSize: 11, color: c.muted,
      fontFace: c.font, align: 'left', valign: 'top',
      wrap: true,
    });
  });

  // Insight line
  if (slide.insight) {
    s.addText(slide.insight, {
      x: 0.6, y: 6.8, w: 12.1, h: 0.42,
      fontSize: 13, color: c.muted, italic: true,
      fontFace: c.font, align: 'center',
    });
  }

  addSlideNumber(s, slideNum, total, c);
}

// ─── Bullets slide ─────────────────────────────────────────────────────────────
// Title, thin divider, up to 4 rows with colored circle + text. No pptxgenjs bullets.

function renderBulletsSlide(pptx, s, slide, c, slideNum, total) {
  s.background = { color: c.bg };

  // Title
  s.addText(slide.title || '', {
    x: 0.6, y: 0.38, w: 12.1, h: 0.78,
    fontSize: 24, bold: true, color: c.text,
    fontFace: c.font, align: 'left', valign: 'middle',
  });

  // Divider line under title
  s.addShape(pptx.ShapeType.rect, {
    x: 0.6, y: 1.25, w: 12.13, h: 0.025,
    fill: { color: c.cardBorder },
    line: { type: 'none' },
  });

  const points   = (slide.points || []).slice(0, 4);
  const rowStart = 1.62;
  const rowGap   = 1.12;

  points.forEach((pt, i) => {
    const rowY     = rowStart + i * rowGap;
    const dotColor = resolveColor(pt.icon, c);

    // Colored circle dot
    s.addShape(pptx.ShapeType.ellipse, {
      x: 0.6, y: rowY + 0.09, w: 0.17, h: 0.17,
      fill: { color: dotColor },
      line: { type: 'none' },
    });

    // Point text
    s.addText(pt.text || '', {
      x: 1.0, y: rowY, w: 11.6, h: 0.42,
      fontSize: 16, color: c.text,
      fontFace: c.font, align: 'left', valign: 'middle',
    });
  });

  // Optional footnote
  if (slide.note) {
    s.addShape(pptx.ShapeType.rect, {
      x: 0.6, y: 7.05, w: 12.13, h: 0.025,
      fill: { color: c.cardBorder },
      line: { type: 'none' },
    });
    s.addText(slide.note, {
      x: 0.6, y: 7.1, w: 12.1, h: 0.3,
      fontSize: 10, color: c.muted, italic: true,
      fontFace: c.font, align: 'left',
    });
  }

  addSlideNumber(s, slideNum, total, c);
}

// ─── Comparison slide ──────────────────────────────────────────────────────────
// Two equal-width cards side by side, accent-colored headers, item lists.

function renderComparisonSlide(pptx, s, slide, c, slideNum, total) {
  s.background = { color: c.bg };

  // Title
  s.addText(slide.title || '', {
    x: 0.5, y: 0.33, w: 12.3, h: 0.78,
    fontSize: 24, bold: true, color: c.text,
    fontFace: c.font, align: 'left', valign: 'middle',
  });

  const leftData  = slide.left  || { label: 'Left',  items: [] };
  const rightData = slide.right || { label: 'Right', items: [] };
  const cardY = 1.25;
  const cardH = 5.7;
  const cardW = 5.97;
  const gap   = 0.39;

  [[leftData, 0.5, c.accent], [rightData, 0.5 + cardW + gap, c.secondary]].forEach(
    ([data, cx, headerColor]) => {
      // Card background
      s.addShape(pptx.ShapeType.rect, {
        x: cx, y: cardY, w: cardW, h: cardH,
        fill: { color: c.cardBg },
        line: { color: c.cardBorder, width: 1 },
      });

      // Header band
      s.addShape(pptx.ShapeType.rect, {
        x: cx, y: cardY, w: cardW, h: 0.65,
        fill: { color: headerColor },
        line: { type: 'none' },
      });

      // Header label
      s.addText(data.label || '', {
        x: cx + 0.22, y: cardY + 0.05, w: cardW - 0.3, h: 0.55,
        fontSize: 13, bold: true, color: 'FFFFFF',
        fontFace: c.font, align: 'left', valign: 'middle',
      });

      // Items
      const items = (data.items || []).slice(0, 5);
      items.forEach((item, i) => {
        const itemY = cardY + 0.85 + i * 0.92;

        // Dot indicator
        s.addShape(pptx.ShapeType.ellipse, {
          x: cx + 0.22, y: itemY + 0.12, w: 0.1, h: 0.1,
          fill: { color: headerColor },
          line: { type: 'none' },
        });

        // Item text
        s.addText(item, {
          x: cx + 0.43, y: itemY, w: cardW - 0.58, h: 0.42,
          fontSize: 13, color: c.text,
          fontFace: c.font, align: 'left', valign: 'middle',
          wrap: true,
        });
      });
    }
  );

  addSlideNumber(s, slideNum, total, c);
}

// ─── Bar chart slide ───────────────────────────────────────────────────────────
// Manually rendered horizontal bars as rectangles — fully editable in PowerPoint.

function renderBarChartSlide(pptx, s, slide, c, slideNum, total) {
  s.background = { color: c.bg };

  // Title
  s.addText(slide.title || '', {
    x: 0.5, y: 0.33, w: 12.3, h: 0.78,
    fontSize: 24, bold: true, color: c.text,
    fontFace: c.font, align: 'left', valign: 'middle',
  });

  const bars    = (slide.bars || []).slice(0, 6);
  const maxVal  = Math.max(...bars.map(b => Number(b.value) || 0), 1);
  const labelW  = 2.35;
  const barX    = 2.95;
  const maxBarW = 9.5;
  const barH    = 0.44;
  const rowH    = 0.98;
  const startY  = 1.42;

  // yAxisLabel as a small caption above bars
  if (slide.yAxisLabel) {
    s.addText(slide.yAxisLabel.toUpperCase(), {
      x: barX, y: 1.1, w: maxBarW, h: 0.28,
      fontSize: 9, color: c.muted,
      fontFace: c.font, align: 'left',
      charSpacing: 2,
    });
  }

  bars.forEach((bar, i) => {
    const rowY     = startY + i * rowH;
    const barColor = resolveColor(bar.color, c);
    const val      = Math.max(Number(bar.value) || 0, 0);
    const barW     = (val / maxVal) * maxBarW;

    // Category label (right-aligned, left column)
    s.addText(bar.label || '', {
      x: 0.5, y: rowY, w: labelW - 0.15, h: barH,
      fontSize: 12, color: c.muted,
      fontFace: c.font, align: 'right', valign: 'middle',
    });

    // Bar track (background)
    s.addShape(pptx.ShapeType.roundRect, {
      x: barX, y: rowY, w: maxBarW, h: barH,
      fill: { color: c.cardBg },
      line: { type: 'none' },
      rectRadius: 0.05,
    });

    // Bar fill
    if (barW > 0.08) {
      s.addShape(pptx.ShapeType.roundRect, {
        x: barX, y: rowY, w: barW, h: barH,
        fill: { color: barColor },
        line: { type: 'none' },
        rectRadius: 0.05,
      });
    }

    // Value label at end of bar
    s.addText(String(bar.value), {
      x: barX + barW + 0.12, y: rowY, w: 1.0, h: barH,
      fontSize: 12, bold: true, color: c.text,
      fontFace: c.font, align: 'left', valign: 'middle',
    });
  });

  addSlideNumber(s, slideNum, total, c);
}

// ─── Timeline slide ────────────────────────────────────────────────────────────
// Horizontal timeline with evenly spaced circle nodes, phase labels, actions, owners.

function renderTimelineSlide(pptx, s, slide, c, slideNum, total) {
  s.background = { color: c.bg };

  // Title
  s.addText(slide.title || 'Next Steps', {
    x: 0.6, y: 0.33, w: 12.1, h: 0.78,
    fontSize: 24, bold: true, color: c.text,
    fontFace: c.font, align: 'left', valign: 'middle',
  });

  const steps = (slide.steps || []).slice(0, 5);
  const n     = steps.length || 1;
  const lineX = 1.3;
  const lineW = 10.73;
  const lineY = 3.75;
  const nodeD = 0.28;
  const nodeR = nodeD / 2;

  // Timeline spine
  s.addShape(pptx.ShapeType.rect, {
    x: lineX, y: lineY, w: lineW, h: 0.03,
    fill: { color: c.cardBorder },
    line: { type: 'none' },
  });

  steps.forEach((step, i) => {
    const nx = n === 1
      ? lineX + lineW / 2
      : lineX + (lineW / (n - 1)) * i;

    // Thin connector from phase label to node
    s.addShape(pptx.ShapeType.rect, {
      x: nx - 0.012, y: lineY - 0.72, w: 0.025, h: 0.72,
      fill: { color: c.accent },
      line: { type: 'none' },
    });

    // Phase label (above node)
    s.addText(step.phase || '', {
      x: nx - 0.9, y: lineY - 1.15, w: 1.8, h: 0.4,
      fontSize: 12, bold: true, color: c.accent,
      fontFace: c.font, align: 'center',
    });

    // Node circle
    s.addShape(pptx.ShapeType.ellipse, {
      x: nx - nodeR, y: lineY - nodeR + 0.015,
      w: nodeD, h: nodeD,
      fill: { color: c.accent },
      line: { color: c.bg, width: 2 },
    });

    // Action text (below node)
    s.addText(step.action || '', {
      x: nx - 1.15, y: lineY + 0.42, w: 2.3, h: 0.58,
      fontSize: 13, bold: true, color: c.text,
      fontFace: c.font, align: 'center',
      wrap: true,
    });

    // Owner
    s.addText(step.owner || '', {
      x: nx - 1.15, y: lineY + 1.08, w: 2.3, h: 0.38,
      fontSize: 11, color: c.muted,
      fontFace: c.font, align: 'center',
    });
  });

  addSlideNumber(s, slideNum, total, c);
}

// ─── Quote slide ───────────────────────────────────────────────────────────────
// Full-slide quote with large decorative mark, sentiment dot, attribution.

function renderQuoteSlide(pptx, s, slide, c, slideNum, total) {
  s.background = { color: c.bg };

  // Large decorative quotation mark (muted, decorative)
  s.addText('\u201C', {
    x: 0.4, y: 0.2, w: 2.2, h: 1.8,
    fontSize: 96, color: c.cardBorder,
    fontFace: c.font, align: 'left', valign: 'top',
  });

  // Quote text
  s.addText(slide.quote || '', {
    x: 1.0, y: 1.55, w: 11.3, h: 3.4,
    fontSize: 22, italic: true, color: c.text,
    fontFace: c.font, align: 'center', valign: 'middle',
    wrap: true,
    lineSpacingMultiple: 1.4,
  });

  // Divider line above attribution
  s.addShape(pptx.ShapeType.rect, {
    x: 4.2, y: 5.4, w: 4.93, h: 0.025,
    fill: { color: c.cardBorder },
    line: { type: 'none' },
  });

  // Sentiment dot
  const sentColor =
    slide.sentiment === 'positive' ? c.positive :
    slide.sentiment === 'negative' ? c.negative : c.neutral;

  s.addShape(pptx.ShapeType.ellipse, {
    x: 4.2, y: 5.59, w: 0.15, h: 0.15,
    fill: { color: sentColor },
    line: { type: 'none' },
  });

  // Attribution
  s.addText(slide.attribution || '', {
    x: 4.45, y: 5.52, w: 8.2, h: 0.44,
    fontSize: 13, color: c.muted, italic: true,
    fontFace: c.font, align: 'left', valign: 'middle',
  });

  addSlideNumber(s, slideNum, total, c);
}

// ─── Section divider slide ─────────────────────────────────────────────────────
// Minimal, bold. Two thin accent lines bracket the title block.

function renderSectionDividerSlide(pptx, s, slide, c, slideNum, total) {
  s.background = { color: c.bg };

  const titleY    = 2.85;
  const subtitleY = 4.15;
  const hasSubtitle = !!slide.subtitle;

  // Accent line above title
  s.addShape(pptx.ShapeType.rect, {
    x: 2.17, y: titleY - 0.12, w: 9.0, h: 0.03,
    fill: { color: c.accent },
    line: { type: 'none' },
  });

  // Title
  s.addText(slide.title || '', {
    x: 0.65, y: titleY, w: 12.0, h: 1.2,
    fontSize: 36, bold: true, color: c.text,
    fontFace: c.font, align: 'center', valign: 'middle',
    wrap: true,
  });

  // Subtitle
  if (hasSubtitle) {
    s.addText(slide.subtitle, {
      x: 0.65, y: subtitleY, w: 12.0, h: 0.62,
      fontSize: 16, color: c.muted,
      fontFace: c.font, align: 'center',
    });
  }

  // Accent line below (secondary color)
  s.addShape(pptx.ShapeType.rect, {
    x: 2.17, y: hasSubtitle ? subtitleY + 0.72 : titleY + 1.3,
    w: 9.0, h: 0.03,
    fill: { color: c.secondary },
    line: { type: 'none' },
  });

  addSlideNumber(s, slideNum, total, c);
}

// ─── pptxgenjs deck generator ─────────────────────────────────────────────────
// Dispatches each slide to its dedicated renderer. Every element is a native
// pptxgenjs object (addShape / addText) — never addImage — ensuring full
// editability in PowerPoint and Google Slides.

async function buildPptx(slides, theme) {
  const pptx = new PptxGenJS();
  pptx.layout  = 'LAYOUT_WIDE'; // 13.33" × 7.5"
  pptx.title   = 'Customer Sentiment Analysis Report';
  pptx.author  = 'Customer Sentiment Analysis';

  const c     = buildColors(theme || {});
  const total = slides.length;

  for (let idx = 0; idx < total; idx++) {
    const slide = slides[idx];
    const s     = pptx.addSlide();
    const num   = idx + 1;

    switch (slide.type) {
      case 'title':
        renderTitleSlide(pptx, s, slide, c);
        break;
      case 'stats':
        renderStatsSlide(pptx, s, slide, c, num, total);
        break;
      case 'bullets':
        renderBulletsSlide(pptx, s, slide, c, num, total);
        break;
      case 'comparison':
        renderComparisonSlide(pptx, s, slide, c, num, total);
        break;
      case 'bar_chart':
        renderBarChartSlide(pptx, s, slide, c, num, total);
        break;
      case 'timeline':
        renderTimelineSlide(pptx, s, slide, c, num, total);
        break;
      case 'quote':
        renderQuoteSlide(pptx, s, slide, c, num, total);
        break;
      case 'section_divider':
        renderSectionDividerSlide(pptx, s, slide, c, num, total);
        break;
      default:
        // Fallback: render unknown types as a bullets slide
        renderBulletsSlide(pptx, s, {
          title: slide.title || '',
          points: (slide.body || slide.points || []).map(b =>
            typeof b === 'string' ? { icon: 'accent', text: b } : b
          ),
          note: slide.note,
        }, c, num, total);
    }

    if (slide.speakerNotes) s.addNotes(slide.speakerNotes);
  }

  return pptx.write('base64');
}

// ─── Route ────────────────────────────────────────────────────────────────────

// ─── Template extract route ───────────────────────────────────────────────────
// POST /api/template/extract
// Accepts a .pptx file (multipart), returns extracted theme object.

router.post('/template/extract', upload.single('template'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }
  if (!req.file.originalname.toLowerCase().endsWith('.pptx')) {
    return res.status(400).json({ error: 'Only .pptx files are supported.' });
  }
  try {
    const theme = extractThemeFromPptx(req.file.buffer);
    res.json({ success: true, theme });
  } catch (err) {
    res.status(422).json({ error: err.message || 'Failed to extract theme from template.' });
  }
});

// ─── Presentation generation route ───────────────────────────────────────────
// POST /api/presentation

router.post('/presentation', async (req, res) => {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not configured.' });
    }

    const { report, instructions, customTheme } = req.body;

    if (!instructions || !instructions.trim()) {
      return res.status(400).json({ error: 'Please describe how you would like this presented.' });
    }
    if (!report || !report.data || !report.analysisType) {
      return res.status(400).json({ error: 'Invalid report data. Please run an analysis first.' });
    }

    // Summarise — never pass raw feedback to the presentation agent
    const reportSummary = summariseReport(report);
    const prompt = buildSlidePrompt(reportSummary, instructions.trim());

    // Call Claude Haiku — as required by CLAUDE.md
    const message = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = message.content.find(b => b.type === 'text');
    if (!textBlock) {
      return res.status(500).json({ error: 'No response from Claude. Please try again.' });
    }

    // Parse Claude's slide JSON
    let slideData;
    try {
      const raw = textBlock.text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
      slideData = JSON.parse(raw);
    } catch (parseErr) {
      console.error('Slide JSON parse error:', parseErr.message);
      return res.status(500).json({ error: 'Failed to parse slide structure. Please try again.' });
    }

    if (!Array.isArray(slideData.slides) || slideData.slides.length === 0) {
      return res.status(500).json({ error: 'Claude returned an empty slide deck. Please try again.' });
    }

    // Generate .pptx — customTheme (from uploaded template) overrides Claude's theme choice
    const theme = customTheme || slideData.theme || {};
    const pptxBase64 = await buildPptx(slideData.slides, theme);

    res.json({
      success: true,
      slides: slideData.slides,
      theme,
      style: slideData.style,
      totalSlides: slideData.slides.length,
      pptxBase64,
    });

  } catch (err) {
    console.error('Presentation agent error:', err);
    if (err.status === 401) {
      return res.status(401).json({ error: 'Invalid API key. Check your ANTHROPIC_API_KEY.' });
    }
    res.status(500).json({ error: err.message || 'An unexpected error occurred.' });
  }
});

module.exports = router;
