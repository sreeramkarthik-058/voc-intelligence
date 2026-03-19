const express = require('express');
const multer = require('multer');
const Anthropic = require('@anthropic-ai/sdk');
const { default: Exa } = require('exa-js');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const { parseFile } = require('../utils/fileParser');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    const allowed = ['text/plain', 'text/csv', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    const ext = file.originalname.split('.').pop().toLowerCase();
    const allowedExts = ['txt', 'csv', 'docx'];
    if (allowed.includes(file.mimetype) || allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type. Please upload .txt, .csv, or .docx files.'));
    }
  },
});

// ─── Exa market research ────────────────────────────────────────────────────

function extractSearchTerms(analysisType, data) {
  if (analysisType === 'themes') {
    return (data.themes || []).map(t => t.name).slice(0, 3);
  }
  if (analysisType === 'both') {
    return (data.themes?.list || []).map(t => t.name).slice(0, 3);
  }
  // sentiment-only: use top drivers as search terms
  const terms = [
    ...(data.drivers?.positive?.slice(0, 2) || []),
    ...(data.drivers?.negative?.slice(0, 1) || []),
  ];
  return terms.slice(0, 3);
}

async function fetchMarketResearch(terms) {
  const exa = new Exa(process.env.EXA_API_KEY);

  const results = await Promise.all(
    terms.map(async (term) => {
      try {
        const res = await exa.search(
          `${term} customer experience industry insights`,
          {
            numResults: 3,
            contents: { summary: { query: `one sentence overview of ${term}` } },
          }
        );
        const sources = (res.results || []).map(r => ({
          title: r.title || 'Untitled',
          url: r.url,
          summary: r.summary || '',
        }));
        return { name: term, sources };
      } catch {
        return { name: term, sources: [] };
      }
    })
  );

  return { themes: results.filter(r => r.sources.length > 0) };
}

// ─── Prompt builders ────────────────────────────────────────────────────────

function buildThemePrompt(feedback) {
  return `You are an expert Voice of Customer (VoC) analyst. Analyze the customer feedback below and extract the key themes.

Return ONLY a valid JSON object — no markdown, no code blocks, no explanation. The JSON must strictly follow this schema:

{
  "executiveSummary": "2-3 sentence executive summary of the most important findings",
  "summary": "2-3 sentence executive summary of the main themes found in the feedback",
  "themes": [
    {
      "name": "Short theme name (3-5 words)",
      "description": "1-2 sentence description of what this theme covers",
      "frequency": "high|medium|low",
      "sentiment": "positive|negative|neutral|mixed",
      "keyInsights": ["insight 1", "insight 2", "insight 3"],
      "exampleQuotes": ["verbatim or near-verbatim quote from the feedback", "another quote"]
    }
  ],
  "topFindings": [
    { "text": "Most important finding", "severity": "critical|moderate|info" },
    { "text": "Second finding", "severity": "critical|moderate|info" },
    { "text": "Third finding", "severity": "critical|moderate|info" }
  ],
  "recommendations": ["Actionable recommendation 1", "Actionable recommendation 2", "Actionable recommendation 3"]
}

Guidelines:
- Extract 4–8 meaningful, distinct themes
- frequency: "high" = appears in >30% of feedback, "medium" = 10–30%, "low" = <10%
- exampleQuotes should be actual phrases or sentences from the feedback, not paraphrases
- topFindings should be the 3 most impactful insights a stakeholder needs to know immediately
- recommendations should be concrete and actionable

--- CUSTOMER FEEDBACK ---
${feedback}`;
}

function buildSentimentPrompt(feedback) {
  return `You are an expert Voice of Customer (VoC) analyst. Analyze the sentiment of the customer feedback below.

Return ONLY a valid JSON object — no markdown, no code blocks, no explanation. The JSON must strictly follow this schema:

{
  "executiveSummary": "2-3 sentence executive summary of the overall sentiment picture",
  "summary": "2-3 sentence executive summary of the overall sentiment picture",
  "overall": {
    "score": 7.2,
    "label": "Positive|Mostly Positive|Mixed|Mostly Negative|Negative",
    "description": "One sentence describing the overall sentiment"
  },
  "breakdown": {
    "positive": 45,
    "negative": 30,
    "neutral": 25
  },
  "drivers": {
    "positive": ["Key positive driver 1", "Key positive driver 2", "Key positive driver 3"],
    "negative": ["Key negative driver 1", "Key negative driver 2", "Key negative driver 3"]
  },
  "emotionalTone": {
    "dominant": "Primary emotional tone (e.g. Frustrated, Satisfied, Excited, Disappointed)",
    "secondary": "Secondary emotional tone",
    "tags": ["Emotion tag 1", "Emotion tag 2", "Emotion tag 3"],
    "insights": ["Emotional insight 1", "Emotional insight 2"]
  },
  "notableQuotes": {
    "positive": ["Most positive quote from the feedback", "Another positive quote"],
    "negative": ["Most negative/critical quote from the feedback", "Another negative quote"]
  }
}

Guidelines:
- score is 1–10 (1 = extremely negative, 5 = neutral, 10 = extremely positive)
- breakdown percentages must sum to exactly 100
- drivers should identify the specific reasons behind positive and negative sentiment
- notableQuotes should be verbatim or near-verbatim from the feedback

--- CUSTOMER FEEDBACK ---
${feedback}`;
}

function buildBothPrompt(feedback) {
  return `You are an expert Voice of Customer (VoC) analyst. Analyze the customer feedback below for both themes and sentiment.

Return ONLY a valid JSON object — no markdown, no code blocks, no explanation. The JSON must strictly follow this schema:

{
  "executiveSummary": "3-4 sentence executive summary covering both themes and sentiment",
  "themes": {
    "summary": "1-2 sentence summary of the thematic findings",
    "list": [
      {
        "name": "Short theme name (3-5 words)",
        "description": "1-2 sentence description of what this theme covers",
        "frequency": "high|medium|low",
        "sentiment": "positive|negative|neutral|mixed",
        "keyInsights": ["insight 1", "insight 2"],
        "exampleQuotes": ["verbatim or near-verbatim quote", "another quote"]
      }
    ],
    "topFindings": [
      { "text": "Finding 1", "severity": "critical|moderate|info" },
      { "text": "Finding 2", "severity": "critical|moderate|info" },
      { "text": "Finding 3", "severity": "critical|moderate|info" }
    ],
    "recommendations": ["Recommendation 1", "Recommendation 2", "Recommendation 3"]
  },
  "sentiment": {
    "summary": "1-2 sentence summary of the sentiment findings",
    "overall": {
      "score": 7.2,
      "label": "Positive|Mostly Positive|Mixed|Mostly Negative|Negative",
      "description": "One sentence describing overall sentiment"
    },
    "breakdown": {
      "positive": 45,
      "negative": 30,
      "neutral": 25
    },
    "drivers": {
      "positive": ["Positive driver 1", "Positive driver 2", "Positive driver 3"],
      "negative": ["Negative driver 1", "Negative driver 2", "Negative driver 3"]
    },
    "emotionalTone": {
      "dominant": "Primary emotional tone",
      "secondary": "Secondary emotional tone",
      "tags": ["Emotion tag 1", "Emotion tag 2", "Emotion tag 3"],
      "insights": ["Insight 1", "Insight 2"]
    },
    "notableQuotes": {
      "positive": ["Best positive quote", "Another positive quote"],
      "negative": ["Most critical quote", "Another negative quote"]
    }
  }
}

Guidelines:
- themes.list: extract 4–8 meaningful, distinct themes
- frequency: "high" = >30%, "medium" = 10–30%, "low" = <10%
- breakdown percentages must sum to exactly 100
- quotes should be verbatim or near-verbatim from the feedback

--- CUSTOMER FEEDBACK ---
${feedback}`;
}

// ─── Route ──────────────────────────────────────────────────────────────────

router.post('/analyze', upload.single('file'), async (req, res) => {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not configured. Please add it to your .env file.' });
    }

    const { analysisType, text } = req.body;

    if (!analysisType || !['themes', 'sentiment', 'both'].includes(analysisType)) {
      return res.status(400).json({ error: 'Invalid analysisType. Must be "themes", "sentiment", or "both".' });
    }

    // Resolve feedback text
    let feedbackText = '';
    if (req.file) {
      feedbackText = await parseFile(req.file);
    } else if (text && text.trim()) {
      feedbackText = text.trim();
    } else {
      return res.status(400).json({ error: 'No feedback provided. Please paste text or upload a file.' });
    }

    if (feedbackText.length < 20) {
      return res.status(400).json({ error: 'Feedback is too short to analyze. Please provide more content.' });
    }

    // Build prompt
    let prompt;
    if (analysisType === 'themes') prompt = buildThemePrompt(feedbackText);
    else if (analysisType === 'sentiment') prompt = buildSentimentPrompt(feedbackText);
    else prompt = buildBothPrompt(feedbackText);

    // Call Anthropic API
    const message = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = message.content.find(b => b.type === 'text');
    if (!textBlock) {
      return res.status(500).json({ error: 'No response received from Claude.' });
    }

    // Parse JSON from Claude's response
    let analysisData;
    try {
      // Strip any accidental markdown fences if present
      const raw = textBlock.text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
      analysisData = JSON.parse(raw);
    } catch (parseErr) {
      console.error('JSON parse error:', parseErr.message);
      console.error('Raw response:', textBlock.text.slice(0, 500));
      return res.status(500).json({ error: 'Failed to parse analysis response. Please try again.' });
    }

    // Market research via Exa (optional — skipped if key not set)
    let marketResearch = null;
    if (process.env.EXA_API_KEY) {
      try {
        const terms = extractSearchTerms(analysisType, analysisData);
        if (terms.length > 0) marketResearch = await fetchMarketResearch(terms);
      } catch (err) {
        console.error('Market research error (non-fatal):', err.message);
      }
    }

    res.json({
      success: true,
      analysisType,
      data: analysisData,
      marketResearch,
      metadata: {
        feedbackLength: feedbackText.length,
        source: req.file ? req.file.originalname : 'pasted text',
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('Analysis error:', err);
    if (err.status === 401) {
      return res.status(401).json({ error: 'Invalid API key. Please check your ANTHROPIC_API_KEY.' });
    }
    res.status(500).json({ error: err.message || 'An unexpected error occurred.' });
  }
});

module.exports = router;
