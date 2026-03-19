/* ═══════════════════════════════════════════════════════════════
   Presentation Agent — routes/presentation.js
   Receives structured report + user format instructions.
   Calls Claude Haiku to structure slides, then generates .pptx
   with pptxgenjs. Returns slides JSON + base64 .pptx.
   ═══════════════════════════════════════════════════════════════ */

const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const PptxGenJS = require('pptxgenjs');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const router = express.Router();

// ─── Summarise structured report for Claude ───────────────────────────────────
// Per CLAUDE.md: pass structured report to the agent — never raw feedback.

function summariseReport(report) {
  const { analysisType, data } = report;
  const lines = [];

  if (analysisType === 'both') {
    if (data.executiveSummary) lines.push(`Executive Summary: ${data.executiveSummary}`);

    if (data.themes) {
      lines.push('\nTHEMES:');
      (data.themes.list || []).forEach(t => {
        lines.push(`  • ${t.name} [${t.frequency} frequency, ${t.sentiment}]: ${t.description}`);
        if (t.keyInsights?.length) lines.push(`    Insights: ${t.keyInsights.join(' | ')}`);
      });
      if (data.themes.topFindings?.length)
        lines.push(`Top Findings: ${data.themes.topFindings.join(' | ')}`);
      if (data.themes.recommendations?.length)
        lines.push(`Recommendations: ${data.themes.recommendations.join(' | ')}`);
    }

    if (data.sentiment) {
      const s = data.sentiment;
      lines.push(`\nSENTIMENT: ${s.overall?.label} (score ${s.overall?.score}/10)`);
      lines.push(`  ${s.overall?.description || ''}`);
      const b = s.breakdown;
      if (b) lines.push(`  Breakdown: ${b.positive}% positive, ${b.negative}% negative, ${b.neutral}% neutral`);
      if (s.drivers) {
        lines.push(`  Positive drivers: ${(s.drivers.positive || []).join(', ')}`);
        lines.push(`  Negative drivers: ${(s.drivers.negative || []).join(', ')}`);
      }
      if (s.emotionalTone) lines.push(`  Emotional tone: ${s.emotionalTone.dominant} (secondary: ${s.emotionalTone.secondary})`);
    }
  } else if (analysisType === 'themes') {
    if (data.summary) lines.push(`Summary: ${data.summary}`);
    (data.themes || []).forEach(t => {
      lines.push(`  • ${t.name} [${t.frequency}, ${t.sentiment}]: ${t.description}`);
      if (t.keyInsights?.length) lines.push(`    Insights: ${t.keyInsights.join(' | ')}`);
    });
    if (data.topFindings?.length) lines.push(`\nTop Findings: ${data.topFindings.join(' | ')}`);
    if (data.recommendations?.length) lines.push(`Recommendations: ${data.recommendations.join(' | ')}`);
  } else {
    // sentiment only
    if (data.summary) lines.push(`Summary: ${data.summary}`);
    if (data.overall) lines.push(`Overall: ${data.overall.label} (${data.overall.score}/10) — ${data.overall.description}`);
    const b = data.breakdown;
    if (b) lines.push(`Breakdown: ${b.positive}% positive, ${b.negative}% negative, ${b.neutral}% neutral`);
    if (data.drivers) {
      lines.push(`Positive drivers: ${(data.drivers.positive || []).join(', ')}`);
      lines.push(`Negative drivers: ${(data.drivers.negative || []).join(', ')}`);
    }
    if (data.emotionalTone) lines.push(`Emotional tone: ${data.emotionalTone.dominant} / ${data.emotionalTone.secondary}`);
  }

  return lines.join('\n');
}

// ─── Claude prompt ────────────────────────────────────────────────────────────

function buildSlidePrompt(reportSummary, instructions) {
  return `You are a presentation designer creating an executive deck from a Voice of Customer (VoC) analysis report.

USER INSTRUCTIONS: "${instructions}"

VoC ANALYSIS REPORT:
${reportSummary}

Create a slide deck structure. You MUST include these three slides first, in this exact order:
  1. Title slide — headline title + the single most important key finding as a subtitle
  2. Problem Statement — what the data reveals as the core challenge or gap
  3. Next Steps + Owners — specific actions with responsible owners

Then add additional slides based on what the user asked for.

Parse the user's instructions to determine:
- Colour theme (if mentioned; otherwise pick a professional palette that fits their stated style)
- Presentation style / tone
- Number of additional slides beyond the 3 mandatory ones

Return ONLY a valid JSON object with no markdown, no code fences, no commentary:

{
  "theme": {
    "primary": "#2563eb",
    "accent": "#f59e0b",
    "background": "#ffffff",
    "slideBackground": "#f8fafc",
    "text": "#1e293b",
    "subtext": "#64748b"
  },
  "style": "corporate",
  "slides": [
    {
      "id": 1,
      "type": "title",
      "title": "Slide headline",
      "subtitle": "Key finding or supporting line",
      "body": [],
      "speakerNotes": ""
    },
    {
      "id": 2,
      "type": "problem",
      "title": "Problem Statement",
      "subtitle": "",
      "body": ["Bullet point 1", "Bullet point 2", "Bullet point 3"],
      "speakerNotes": ""
    },
    {
      "id": 3,
      "type": "nextsteps",
      "title": "Next Steps",
      "subtitle": "",
      "body": ["Owner A: Action description", "Owner B: Action description", "Owner C: Action description"],
      "speakerNotes": ""
    }
  ]
}

Slide types: "title" | "problem" | "nextsteps" | "themes" | "sentiment" | "quotes" | "recommendations" | "summary" | "data"
Keep bullet points concise — max 12 words each. Use clear, executive-level language.`;
}

// ─── Strip # and validate hex ─────────────────────────────────────────────────

function hexColor(raw, fallback) {
  if (!raw || typeof raw !== 'string') return fallback;
  const clean = raw.replace('#', '').trim();
  return /^[0-9A-Fa-f]{6}$/.test(clean) ? clean : fallback;
}

// ─── pptxgenjs deck generator ─────────────────────────────────────────────────

async function buildPptx(slides, theme) {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE'; // 13.33" × 7.5"
  pptx.title = 'VoC Intelligence Report';
  pptx.author = 'VoC Intelligence Tool';

  const c = {
    primary:         hexColor(theme.primary, '2563EB'),
    accent:          hexColor(theme.accent, 'F59E0B'),
    background:      hexColor(theme.background, 'FFFFFF'),
    slideBackground: hexColor(theme.slideBackground, 'F8FAFC'),
    text:            hexColor(theme.text, '1E293B'),
    subtext:         hexColor(theme.subtext, '64748B'),
  };

  for (const slide of slides) {
    const s = pptx.addSlide();

    if (slide.type === 'title') {
      // ── Title slide ─────────────────────────────────────────────
      s.background = { color: c.primary };

      // Decorative accent strip at left
      s.addShape(pptx.ShapeType.rect, {
        x: 0, y: 0, w: 0.18, h: 7.5,
        fill: { color: c.accent },
        line: { type: 'none' },
      });

      // Title
      s.addText(slide.title || '', {
        x: 0.55, y: 1.8, w: 12, h: 1.8,
        fontSize: 38, bold: true, color: 'FFFFFF',
        fontFace: 'Calibri', align: 'left', valign: 'middle',
        wrap: true,
      });

      // Subtitle / key finding
      if (slide.subtitle) {
        s.addText(slide.subtitle, {
          x: 0.55, y: 3.75, w: 11, h: 1.2,
          fontSize: 20, color: 'D4D4D8',
          fontFace: 'Calibri', align: 'left', valign: 'top',
          wrap: true,
        });
      }

      // Bottom accent bar
      s.addShape(pptx.ShapeType.rect, {
        x: 0, y: 7.1, w: 13.33, h: 0.4,
        fill: { color: c.accent },
        line: { type: 'none' },
      });

      // Label
      s.addText('Voice of Customer Analysis', {
        x: 0.55, y: 6.6, w: 8, h: 0.4,
        fontSize: 11, color: 'A1A1AA',
        fontFace: 'Calibri', align: 'left',
      });

    } else {
      // ── Content slides ───────────────────────────────────────────
      s.background = { color: c.slideBackground };

      // Header band
      s.addShape(pptx.ShapeType.rect, {
        x: 0, y: 0, w: 13.33, h: 1.25,
        fill: { color: c.primary },
        line: { type: 'none' },
      });

      // Accent stripe in header
      s.addShape(pptx.ShapeType.rect, {
        x: 0, y: 0, w: 0.18, h: 1.25,
        fill: { color: c.accent },
        line: { type: 'none' },
      });

      // Slide title in header
      s.addText(slide.title || '', {
        x: 0.45, y: 0.18, w: 12.5, h: 0.88,
        fontSize: 24, bold: true, color: 'FFFFFF',
        fontFace: 'Calibri', align: 'left', valign: 'middle',
      });

      // Slide number badge (top-right)
      s.addText(`${slide.id}`, {
        x: 12.6, y: 0.22, w: 0.5, h: 0.5,
        fontSize: 11, color: 'FFFFFF',
        fontFace: 'Calibri', align: 'center', valign: 'middle',
        opacity: 0.6,
      });

      // Body bullets
      const bullets = (slide.body || []).filter(Boolean);
      if (bullets.length) {
        const bulletItems = bullets.map(b => ({
          text: b,
          options: { bullet: { type: 'bullet' }, paraSpaceAfter: 6 },
        }));

        s.addText(bulletItems, {
          x: 0.55, y: 1.5, w: 12.2, h: 5.6,
          fontSize: 18, color: c.text,
          fontFace: 'Calibri', align: 'left', valign: 'top',
          lineSpacingMultiple: 1.4,
          wrap: true,
        });
      }

      // Subtitle under title (if present, rendered as a sub-band)
      if (slide.subtitle) {
        s.addText(slide.subtitle, {
          x: 0.55, y: 1.3, w: 11, h: 0.35,
          fontSize: 12, color: c.subtext,
          fontFace: 'Calibri', align: 'left', italic: true,
        });
      }

      // Bottom accent line
      s.addShape(pptx.ShapeType.rect, {
        x: 0, y: 7.3, w: 13.33, h: 0.2,
        fill: { color: c.accent },
        line: { type: 'none' },
        opacity: 0.5,
      });
    }

    // Speaker notes
    if (slide.speakerNotes) {
      s.addNotes(slide.speakerNotes);
    }
  }

  return pptx.write('base64');
}

// ─── Route ────────────────────────────────────────────────────────────────────

router.post('/presentation', async (req, res) => {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not configured.' });
    }

    const { report, instructions } = req.body;

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

    // Generate .pptx
    const pptxBase64 = await buildPptx(slideData.slides, slideData.theme || {});

    res.json({
      success: true,
      slides: slideData.slides,
      theme: slideData.theme,
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
