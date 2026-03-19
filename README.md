# Customer Sentiment Analysis

**Skim through your customer responses to find what really matters.**

An AI-powered tool that takes raw customer feedback and turns it into structured, actionable insights — themes, sentiment, emotional tone, key findings, and recommendations — in seconds.

Paste text, upload a file, and get a full analysis you can explore in-browser or download as a presentation, PDF, or plain text.

---

## What it does

- **Analyzes customer feedback** — paste text directly or upload a CSV, TXT, or Word document
- **Identifies themes** — groups feedback into recurring topics with frequency and detail
- **Breaks down sentiment** — positive, negative, and neutral distribution with a sentiment score
- **Surfaces what matters** — executive summary, top findings, recommendations, sentiment drivers, and emotional tone
- **Extracts notable quotes** — pulls direct customer voices grouped by sentiment
- **Runs market research** — optional web research via Exa to add industry context to each theme
- **Generates presentations** — AI-powered presentation agent creates downloadable, editable .pptx slide decks
- **Exports results** — download your analysis as PDF or plain text

---

## How the results are organized

After analysis, results are displayed in a clean tabbed interface:

| Tab | What's inside |
|-----|--------------|
| **Overview** | Executive summary, top findings, recommendations |
| **Themes** | Themes summary, detailed breakdown of each key theme |
| **Sentiment** | Sentiment score and distribution, sentiment drivers, emotional tone |
| **Voices** | Notable customer quotes grouped by sentiment |
| **Market Research** | Web research results per theme (requires Exa API key) |

---

## Presentation agent

The built-in presentation agent generates slide decks from your analysis. You control the number of slides, presentation focus, and visual theme.

**Theme options:**
- **Futuristic Dark** — dark backgrounds, gradient accents, data-as-visuals (default)
- **Futuristic Light** — clean light variant with the same modern styling
- **Upload your own template** — upload a .pptx file and the agent extracts your brand colors, fonts, and applies them to the generated deck

Every generated .pptx is fully editable in Microsoft PowerPoint and Google Slides. All elements (text boxes, shapes, charts) are native objects, not flattened images.

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | HTML, CSS, vanilla JavaScript |
| Backend | Node.js, Express |
| AI | Anthropic Claude Haiku (claude-haiku-4-5) |
| Web search | Exa (exa-js) |
| Presentations | pptxgenjs v4 |
| File parsing | mammoth (docx), csv-parse (csv), multer (uploads) |
| PDF export | html2pdf.js (client-side) |

---

## Getting started

### Prerequisites

- Node.js (v18 or higher)
- An Anthropic API key ([get one here](https://console.anthropic.com/))
- An Exa API key (optional, for market research — [get one here](https://exa.ai/))

### Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/sreeramkarthik-058/voc-intelligence.git
   cd voc-intelligence
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in the root directory:
   ```
   ANTHROPIC_API_KEY=your_anthropic_api_key_here
   EXA_API_KEY=your_exa_api_key_here
   ```

4. Start the server:
   ```bash
   node server.js
   ```

5. Open your browser and go to `http://localhost:3000`

---

## Project structure

```
├── server.js                  # Express server, registers routes
├── routes/
│   ├── analyze.js             # Analysis route — Claude Haiku + Exa search
│   └── presentation.js        # Presentation agent — slide JSON → pptxgenjs → .pptx
├── utils/
│   ├── fileParser.js          # CSV and Word document parsing
│   └── templateParser.js      # Extracts theme from uploaded .pptx templates
├── public/
│   ├── index.html             # Frontend UI
│   ├── app.js                 # Frontend logic (tabs, rendering, dark mode, animations)
│   └── styles.css             # Design system with dark mode support
├── CLAUDE.md                  # Project context for AI-assisted development
└── .env                       # API keys (not committed)
```

---

## Features

- **Dark mode** — toggle in the header, respects system preference on first load
- **Accessible** — WCAG AA compliant with aria labels, keyboard navigation, focus indicators, and prefers-reduced-motion support
- **Mobile responsive** — works on phone, tablet, and desktop
- **Animated metrics** — count-up animations on sentiment score, negative %, and themes found

---

## License

MIT

---

## Contributing

Contributions are welcome. Open an issue or submit a pull request.
