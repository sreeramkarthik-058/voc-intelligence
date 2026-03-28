---
name: analysis-route
description: Rules for the analysis API route and AI prompt schemas. Use when working on routes/analyze.js or AI prompts.
---

# Analysis route

## Route: POST /api/analyze (routes/analyze.js)

Accepts multipart form: `analysisType` (themes | sentiment | both) + text or file. Calls Claude Haiku with a JSON-only prompt; parses structured response. Returns `{ success, analysisType, data, metadata }`.

## AI prompt schema

All prompts return JSON only — no markdown fences.

### Common fields (all types)

- `executiveSummary` — 2–4 sentence top-level summary; used by Overview tab
- `topFindings` — array of `{ text: string, severity: "critical"|"moderate"|"info" }`; used by Overview tab finding cards

### Themes type

- `themes` — array of `{ name, description, frequency, sentiment, keyInsights[], exampleQuotes[] }`

### Sentiment type

- `sentiment.breakdown` — `{ positive, negative, neutral }` percentages summing to 100
- `emotionalTone.tags` — string array e.g. ["Frustrated","Hopeful"]; used by Sentiment tab tone pills
- `notableQuotes` — `{ positive: [], negative: [] }` verbatim quotes; used by Voices tab

### Both type

- `themes` — object with `{ summary, list[], topFindings[], recommendations[] }`
- Includes all sentiment fields above

### Backward compatibility

`normalizeFindings()` in app.js converts old string-array topFindings to `[{text, severity}]`.

## Cost rules

- ALWAYS use claude-haiku-4-5 — NEVER Sonnet or Opus
- Only call AI when user explicitly triggers analysis
- Template extraction is a separate call — never bundled with generation