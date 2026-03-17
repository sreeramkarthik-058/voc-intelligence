/* ═══════════════════════════════════════════════════════════════
   VoC Intelligence Tool — Frontend Logic
   ═══════════════════════════════════════════════════════════════ */

// ─── State ───────────────────────────────────────────────────────
const state = {
  currentStep: 1,
  activeTab: 'paste',
  selectedFile: null,
  analysisType: null,
  lastReport: null,
  lastMetadata: null,
};

// ─── DOM refs ─────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const panels = {
  1: $('panel-1'),
  2: $('panel-2'),
  loading: $('panel-loading'),
  report: $('panel-report'),
};

// ─── Step navigation ─────────────────────────────────────────────

function goToStep(step) {
  // Hide all panels
  Object.values(panels).forEach(p => p && p.classList.remove('active'));

  // Update step indicator
  document.querySelectorAll('.step').forEach(el => {
    const s = parseInt(el.dataset.step, 10);
    el.classList.toggle('active', s === step);
    el.classList.toggle('completed', s < step);
  });

  state.currentStep = step;

  if (step === 1) panels[1].classList.add('active');
  else if (step === 2) panels[2].classList.add('active');
  else if (step === 'loading') panels.loading.classList.add('active');
  else if (step === 'report') panels.report.classList.add('active');
}

// ─── Tab switching ────────────────────────────────────────────────

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    state.activeTab = tab;

    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

    btn.classList.add('active');
    $(`tab-${tab}`).classList.add('active');

    if (tab === 'paste') {
      state.selectedFile = null;
      updateDropZone(null);
    }
  });
});

// ─── Textarea char count ──────────────────────────────────────────

$('feedback-text').addEventListener('input', function () {
  const count = this.value.length;
  $('char-count').textContent = count.toLocaleString() + ' character' + (count !== 1 ? 's' : '');
});

// ─── File upload ──────────────────────────────────────────────────

const dropZone = $('drop-zone');
const fileInput = $('file-input');

dropZone.addEventListener('click', e => {
  if (e.target.tagName !== 'BUTTON' && !e.target.closest('.file-selected')) {
    fileInput.click();
  }
});

fileInput.addEventListener('change', e => {
  if (e.target.files[0]) handleFile(e.target.files[0]);
});

dropZone.addEventListener('dragover', e => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));

dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
});

$('remove-file').addEventListener('click', e => {
  e.stopPropagation();
  state.selectedFile = null;
  fileInput.value = '';
  updateDropZone(null);
});

function handleFile(file) {
  const allowed = ['.txt', '.csv', '.docx'];
  const ext = '.' + file.name.split('.').pop().toLowerCase();
  if (!allowed.includes(ext)) {
    showError(`Unsupported file type "${ext}". Please use .txt, .csv, or .docx.`);
    return;
  }
  state.selectedFile = file;
  updateDropZone(file);
}

function updateDropZone(file) {
  const info = $('file-selected');
  const icon = dropZone.querySelector('.drop-zone-icon');
  const text = dropZone.querySelector('.drop-zone-text');
  const formats = dropZone.querySelector('.drop-zone-formats');

  if (file) {
    $('file-name').textContent = file.name;
    $('file-size').textContent = formatBytes(file.size);
    info.classList.remove('hidden');
    icon.style.opacity = '0.3';
    text.style.opacity = '0.3';
    formats.style.opacity = '0.3';
  } else {
    info.classList.add('hidden');
    icon.style.opacity = '';
    text.style.opacity = '';
    formats.style.opacity = '';
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

// ─── Step 1 → 2 ──────────────────────────────────────────────────

$('step1-next').addEventListener('click', () => {
  const text = $('feedback-text').value.trim();

  if (state.activeTab === 'paste') {
    if (!text || text.length < 20) {
      showError('Please paste at least a few lines of customer feedback.');
      return;
    }
  } else {
    if (!state.selectedFile) {
      showError('Please select a file to upload.');
      return;
    }
  }

  hideError();
  goToStep(2);
});

// ─── Analysis type selection ──────────────────────────────────────

document.querySelectorAll('input[name="analysisType"]').forEach(radio => {
  radio.addEventListener('change', () => {
    state.analysisType = radio.value;
    $('analyze-btn').disabled = false;
  });
});

// ─── Step 2 → back ───────────────────────────────────────────────

$('step2-back').addEventListener('click', () => goToStep(1));

// ─── Run analysis ─────────────────────────────────────────────────

$('analyze-btn').addEventListener('click', runAnalysis);

async function runAnalysis() {
  hideError();
  goToStep('loading');
  animateLoadingSteps();

  const formData = new FormData();
  formData.append('analysisType', state.analysisType);

  if (state.activeTab === 'paste') {
    formData.append('text', $('feedback-text').value.trim());
  } else {
    formData.append('file', state.selectedFile);
  }

  try {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      body: formData,
    });

    const json = await res.json();

    if (!res.ok || !json.success) {
      throw new Error(json.error || 'Analysis failed. Please try again.');
    }

    state.lastReport = json;
    state.lastMetadata = json.metadata;

    // Small delay so user sees the final loading step
    await sleep(600);

    renderReport(json);
    goToStep('report');

    // Update step indicator to show step 3 active
    document.querySelectorAll('.step').forEach(el => {
      const s = parseInt(el.dataset.step, 10);
      el.classList.toggle('active', s === 3);
      el.classList.toggle('completed', s < 3);
    });

  } catch (err) {
    goToStep(2);
    showError(err.message || 'Something went wrong. Please try again.');
  }
}

// ─── Loading animation ────────────────────────────────────────────

function animateLoadingSteps() {
  const steps = ['ls-1', 'ls-2', 'ls-3', 'ls-4'];
  steps.forEach(id => {
    const el = $(id);
    el.classList.remove('active', 'done');
  });

  const delays = [0, 1800, 3200, 5000];
  steps.forEach((id, i) => {
    setTimeout(() => {
      if (i > 0) $(steps[i - 1]).classList.replace('active', 'done');
      $(id).classList.add('active');
    }, delays[i]);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── New Analysis button ──────────────────────────────────────────

$('new-analysis-btn').addEventListener('click', () => {
  goToStep(1);
  $('report-content').innerHTML = '';
  // Reset radio buttons
  document.querySelectorAll('input[name="analysisType"]').forEach(r => r.checked = false);
  state.analysisType = null;
  $('analyze-btn').disabled = true;
  state.selectedFile = null;
  fileInput.value = '';
  updateDropZone(null);
});

// ─── Export ───────────────────────────────────────────────────────

$('export-pdf-btn').addEventListener('click', exportPDF);
$('export-txt-btn').addEventListener('click', exportText);

async function exportPDF() {
  if (!state.lastReport) return;

  const el = $('report-content');
  const btn = $('export-pdf-btn');
  btn.textContent = 'Generating…';
  btn.disabled = true;

  const opt = {
    margin: [10, 10, 10, 10],
    filename: `voc-report-${Date.now()}.pdf`,
    image: { type: 'jpeg', quality: 0.95 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
  };

  try {
    await html2pdf().set(opt).from(el).save();
  } catch {
    // Fallback: print dialog
    window.print();
  } finally {
    btn.innerHTML = `<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V7.414A2 2 0 0015.414 6L12 2.586A2 2 0 0010.586 2H6zm5 6a1 1 0 10-2 0v3.586l-1.293-1.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 11.586V8z" clip-rule="evenodd"/></svg> PDF`;
    btn.disabled = false;
  }
}

function exportText() {
  if (!state.lastReport) return;
  const txt = buildPlainText(state.lastReport);
  const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `voc-report-${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

function buildPlainText(report) {
  const { analysisType, data, metadata, marketResearch } = report;
  const lines = [];
  const hr = '═'.repeat(60);
  const sep = '─'.repeat(60);

  lines.push(hr);
  lines.push('VoC INTELLIGENCE REPORT');
  lines.push(`Analysis Type: ${analysisType.toUpperCase()}`);
  lines.push(`Source: ${metadata.source}`);
  lines.push(`Generated: ${new Date(metadata.timestamp).toLocaleString()}`);
  lines.push(hr);
  lines.push('');

  if (analysisType === 'both') {
    lines.push('EXECUTIVE SUMMARY');
    lines.push(sep);
    lines.push(data.executiveSummary || '');
    lines.push('');
    appendThemesText(lines, data.themes, sep);
    appendSentimentText(lines, data.sentiment, sep);
  } else if (analysisType === 'themes') {
    appendThemesText(lines, data, sep);
  } else {
    appendSentimentText(lines, data, sep);
  }

  if (marketResearch?.themes?.length) {
    lines.push('MARKET RESEARCH');
    lines.push(sep);
    marketResearch.themes.forEach(theme => {
      lines.push(`\n${theme.name.toUpperCase()}`);
      theme.sources.forEach((s, i) => {
        lines.push(`  ${i + 1}. ${s.title}`);
        lines.push(`     ${s.url}`);
        if (s.summary) lines.push(`     ${s.summary}`);
      });
    });
    lines.push('');
  }

  return lines.join('\n');
}

function appendThemesText(lines, data, sep) {
  const themeList = data.list || data.themes || [];
  lines.push('THEME ANALYSIS');
  lines.push(sep);
  if (data.summary) { lines.push(data.summary); lines.push(''); }

  themeList.forEach((t, i) => {
    lines.push(`Theme ${i + 1}: ${t.name}`);
    lines.push(`  Frequency: ${t.frequency} | Sentiment: ${t.sentiment}`);
    lines.push(`  ${t.description}`);
    if (t.keyInsights?.length) {
      lines.push('  Key Insights:');
      t.keyInsights.forEach(ins => lines.push(`    • ${ins}`));
    }
    if (t.exampleQuotes?.length) {
      lines.push('  Representative Quotes:');
      t.exampleQuotes.forEach(q => lines.push(`    "${q}"`));
    }
    lines.push('');
  });

  if (data.topFindings?.length) {
    lines.push('TOP FINDINGS');
    data.topFindings.forEach((f, i) => lines.push(`  ${i + 1}. ${f}`));
    lines.push('');
  }
  if (data.recommendations?.length) {
    lines.push('RECOMMENDATIONS');
    data.recommendations.forEach((r, i) => lines.push(`  ${i + 1}. ${r}`));
    lines.push('');
  }
}

function appendSentimentText(lines, data, sep) {
  lines.push('SENTIMENT ANALYSIS');
  lines.push(sep);
  if (data.summary) { lines.push(data.summary); lines.push(''); }

  if (data.overall) {
    lines.push(`Overall Score: ${data.overall.score}/10 (${data.overall.label})`);
    lines.push(data.overall.description || '');
    lines.push('');
  }
  if (data.breakdown) {
    const b = data.breakdown;
    lines.push(`Sentiment Breakdown: ${b.positive}% Positive | ${b.negative}% Negative | ${b.neutral}% Neutral`);
    lines.push('');
  }
  if (data.drivers) {
    lines.push('Positive Drivers:');
    (data.drivers.positive || []).forEach(d => lines.push(`  + ${d}`));
    lines.push('Negative Drivers:');
    (data.drivers.negative || []).forEach(d => lines.push(`  − ${d}`));
    lines.push('');
  }
  if (data.emotionalTone) {
    lines.push(`Emotional Tone: ${data.emotionalTone.dominant} (secondary: ${data.emotionalTone.secondary})`);
    (data.emotionalTone.insights || []).forEach(ins => lines.push(`  • ${ins}`));
    lines.push('');
  }
  if (data.notableQuotes) {
    if (data.notableQuotes.positive?.length) {
      lines.push('Positive Quotes:');
      data.notableQuotes.positive.forEach(q => lines.push(`  "${q}"`));
    }
    if (data.notableQuotes.negative?.length) {
      lines.push('Negative Quotes:');
      data.notableQuotes.negative.forEach(q => lines.push(`  "${q}"`));
    }
    lines.push('');
  }
}

// ─── Error handling ───────────────────────────────────────────────

function showError(msg) {
  $('error-message').textContent = msg;
  $('error-banner').classList.remove('hidden');
  $('error-banner').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function hideError() {
  $('error-banner').classList.add('hidden');
}
$('close-error').addEventListener('click', hideError);

// ─── Report renderer ──────────────────────────────────────────────

function renderReport(report) {
  const { analysisType, data, metadata } = report;
  const container = $('report-content');
  container.innerHTML = '';

  const typeLabels = {
    themes: 'Theme Extraction',
    sentiment: 'Sentiment Analysis',
    both: 'Full Analysis',
  };

  // Header
  container.appendChild(el('div', { class: 'report-header' }, `
    <div class="report-header-meta">
      <span>VoC Intelligence Report</span>
      <span>·</span>
      <span class="report-type-badge">${typeLabels[analysisType]}</span>
    </div>
    <div class="report-title">Customer Feedback Analysis</div>
    <div class="report-source">Source: ${esc(metadata.source)} &nbsp;·&nbsp; ${new Date(metadata.timestamp).toLocaleString()}</div>
  `));

  if (analysisType === 'both') {
    renderBothReport(container, data);
  } else if (analysisType === 'themes') {
    renderThemesReport(container, data);
  } else {
    renderSentimentReport(container, data);
  }

  if (report.marketResearch?.themes?.length) {
    renderMarketResearch(container, report.marketResearch);
  }
}

function renderBothReport(container, data) {
  // Executive summary
  if (data.executiveSummary) {
    container.appendChild(buildSection('Executive Summary', 'summary', iconSummary(), `
      <p class="exec-summary">${esc(data.executiveSummary)}</p>
    `));
  }
  // Themes section
  if (data.themes) {
    const themesData = {
      summary: data.themes.summary,
      themes: data.themes.list,
      topFindings: data.themes.topFindings,
      recommendations: data.themes.recommendations,
    };
    renderThemesReport(container, themesData);
  }
  // Sentiment section
  if (data.sentiment) {
    renderSentimentReport(container, data.sentiment);
  }
}

function renderThemesReport(container, data) {
  // Summary card
  if (data.summary) {
    container.appendChild(buildSection('Themes Summary', 'summary', iconSummary(), `
      <p class="exec-summary">${esc(data.summary)}</p>
    `));
  }

  // Theme cards
  const themes = data.list || data.themes || [];
  if (themes.length) {
    const grid = document.createElement('div');
    grid.className = 'themes-grid';
    themes.forEach(t => grid.appendChild(buildThemeCard(t)));

    container.appendChild(buildSection('Key Themes', 'themes', iconThemes(), grid, true));
  }

  // Top findings
  if (data.topFindings?.length) {
    container.appendChild(buildSection('Top Findings', 'findings', iconFindings(), `
      <ul class="findings-list">
        ${data.topFindings.map((f, i) => `
          <li class="finding-item">
            <div class="finding-num">${i + 1}</div>
            <div>${esc(f)}</div>
          </li>
        `).join('')}
      </ul>
    `));
  }

  // Recommendations
  if (data.recommendations?.length) {
    container.appendChild(buildSection('Recommendations', 'recommendations', iconRecommendations(), `
      <ul class="recommendations-list">
        ${data.recommendations.map(r => `
          <li class="rec-item">
            <div class="rec-icon">${iconCheck()}</div>
            <div>${esc(r)}</div>
          </li>
        `).join('')}
      </ul>
    `));
  }
}

function renderSentimentReport(container, data) {
  // Summary
  if (data.summary) {
    container.appendChild(buildSection('Sentiment Overview', 'sentiment', iconSentiment(), buildSentimentOverviewHTML(data)));
  }

  // Drivers
  if (data.drivers) {
    container.appendChild(buildSection('Sentiment Drivers', 'drivers', iconDrivers(), `
      <div class="drivers-grid">
        <div class="driver-column">
          <div class="driver-column-title" style="color:#059669">
            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z" clip-rule="evenodd"/></svg>
            Positive Drivers
          </div>
          ${(data.drivers.positive || []).map(d => `<div class="driver-item driver-positive">${esc(d)}</div>`).join('')}
        </div>
        <div class="driver-column">
          <div class="driver-column-title" style="color:#dc2626">
            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M14.707 10.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 12.586V5a1 1 0 012 0v7.586l2.293-2.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
            Negative Drivers
          </div>
          ${(data.drivers.negative || []).map(d => `<div class="driver-item driver-negative">${esc(d)}</div>`).join('')}
        </div>
      </div>
    `));
  }

  // Emotional tone
  if (data.emotionalTone) {
    const tone = data.emotionalTone;
    container.appendChild(buildSection('Emotional Tone', 'tone', iconTone(), `
      <div class="tone-row">
        <div>
          <div class="tone-label">Dominant</div>
          <div class="tone-chip tone-dominant">${esc(tone.dominant || '')}</div>
        </div>
        ${tone.secondary ? `<div>
          <div class="tone-label">Secondary</div>
          <div class="tone-chip tone-secondary">${esc(tone.secondary)}</div>
        </div>` : ''}
      </div>
      <div class="tone-insights">
        ${(tone.insights || []).map(i => `<div class="tone-insight">💡 ${esc(i)}</div>`).join('')}
      </div>
    `));
  }

  // Notable quotes
  if (data.notableQuotes) {
    const q = data.notableQuotes;
    container.appendChild(buildSection('Notable Quotes', 'quotes', iconQuotes(), `
      <div class="quotes-grid">
        <div class="quotes-group">
          <div class="quotes-group-title" style="color:#059669">
            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z"/></svg>
            Positive
          </div>
          ${(q.positive || []).map(quote => `<blockquote class="notable-quote quote-positive">${esc(quote)}</blockquote>`).join('')}
        </div>
        <div class="quotes-group">
          <div class="quotes-group-title" style="color:#dc2626">
            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" style="transform:rotate(180deg)"><path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z"/></svg>
            Negative / Critical
          </div>
          ${(q.negative || []).map(quote => `<blockquote class="notable-quote quote-negative">${esc(quote)}</blockquote>`).join('')}
        </div>
      </div>
    `));
  }
}

function buildSentimentOverviewHTML(data) {
  const o = data.overall || {};
  const b = data.breakdown || {};
  const score = parseFloat(o.score) || 5;
  const pct = (score / 10) * 100;
  const color = score >= 7 ? '#10b981' : score >= 4.5 ? '#f59e0b' : '#ef4444';
  const circum = 2 * Math.PI * 40;
  const offset = circum - (pct / 100) * circum;

  const pos = b.positive || 0;
  const neg = b.negative || 0;
  const neu = b.neutral || 0;

  return `
    <div class="sentiment-overview">
      <div class="score-ring-wrapper">
        <div class="score-ring">
          <svg width="100" height="100" viewBox="0 0 100 100">
            <circle class="score-bg" cx="50" cy="50" r="40"/>
            <circle class="score-fill" cx="50" cy="50" r="40"
              stroke="${color}"
              stroke-dasharray="${circum}"
              stroke-dashoffset="${offset}"
            />
          </svg>
          <div class="score-text">
            <span class="score-value" style="color:${color}">${score.toFixed(1)}</span>
            <span class="score-out-of">/10</span>
          </div>
        </div>
        <div class="score-label" style="color:${color}">${esc(o.label || '')}</div>
      </div>
      <div class="sentiment-meta">
        <div class="sentiment-label-big" style="color:${color}">${esc(o.label || 'Mixed')}</div>
        <div class="sentiment-desc">${esc(o.description || data.summary || '')}</div>
      </div>
    </div>

    <div class="breakdown-bar-wrapper">
      <div class="breakdown-bar">
        <div class="bar-positive" style="width:${pos}%"></div>
        <div class="bar-negative" style="width:${neg}%"></div>
        <div class="bar-neutral" style="width:${neu}%"></div>
      </div>
      <div class="breakdown-legend">
        <div class="legend-item">
          <div class="legend-dot positive"></div>
          <span class="legend-value">${pos}%</span>
          <span class="legend-name">Positive</span>
        </div>
        <div class="legend-item">
          <div class="legend-dot negative"></div>
          <span class="legend-value">${neg}%</span>
          <span class="legend-name">Negative</span>
        </div>
        <div class="legend-item">
          <div class="legend-dot neutral"></div>
          <span class="legend-value">${neu}%</span>
          <span class="legend-name">Neutral</span>
        </div>
      </div>
    </div>
  `;
}

function buildThemeCard(theme) {
  const freqClass = `freq-${(theme.frequency || 'medium').toLowerCase()}`;
  const sentClass = `sent-${(theme.sentiment || 'neutral').toLowerCase()}`;

  const card = document.createElement('div');
  card.className = 'theme-card';
  card.innerHTML = `
    <div class="theme-card-header">
      <div class="theme-name">${esc(theme.name)}</div>
      <div class="theme-badges">
        <span class="badge ${freqClass}">${esc(theme.frequency || 'medium')}</span>
        <span class="badge ${sentClass}">${esc(theme.sentiment || 'neutral')}</span>
      </div>
    </div>
    <div class="theme-card-body">
      <p class="theme-description">${esc(theme.description)}</p>
      ${theme.keyInsights?.length ? `
        <div class="theme-insights">
          <div class="insights-title">Key Insights</div>
          <ul class="insights-list">
            ${theme.keyInsights.map(i => `<li class="insight-item">${esc(i)}</li>`).join('')}
          </ul>
        </div>
      ` : ''}
      ${theme.exampleQuotes?.length ? `
        <div class="theme-quotes">
          ${theme.exampleQuotes.map(q => `<div class="quote-item">"${esc(q)}"</div>`).join('')}
        </div>
      ` : ''}
    </div>
  `;
  return card;
}

// ─── Market research renderer ─────────────────────────────────────

function renderMarketResearch(container, data) {
  const grid = document.createElement('div');
  grid.className = 'market-research-grid';

  data.themes.forEach(theme => {
    const themeDiv = document.createElement('div');
    themeDiv.className = 'market-research-theme';
    themeDiv.innerHTML = `
      <div class="market-theme-name">${esc(theme.name)}</div>
      <div class="source-cards">
        ${theme.sources.map(s => buildSourceCardHTML(s)).join('')}
      </div>
    `;
    grid.appendChild(themeDiv);
  });

  container.appendChild(buildSection('Market Research', 'market', iconMarketResearch(), grid, true));
}

function buildSourceCardHTML(source) {
  const domain = getDomain(source.url);
  return `
    <a class="source-card" href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">
      <div class="source-card-title">${esc(source.title)}</div>
      <div class="source-card-domain">${esc(domain)}</div>
      ${source.summary ? `<div class="source-card-summary">${esc(source.summary)}</div>` : ''}
    </a>
  `;
}

function getDomain(url) {
  try { return new URL(url).hostname.replace('www.', ''); }
  catch { return url; }
}

// ─── Section builder ──────────────────────────────────────────────

function buildSection(title, iconClass, iconSVG, content, rawNode = false) {
  const section = document.createElement('div');
  section.className = 'report-section';

  const header = document.createElement('div');
  header.className = 'section-header';
  header.innerHTML = `
    <div class="section-header-icon icon-${iconClass}">${iconSVG}</div>
    <h3>${esc(title)}</h3>
  `;
  section.appendChild(header);

  const body = document.createElement('div');
  body.className = 'section-body';

  if (rawNode && typeof content !== 'string') {
    body.appendChild(content);
  } else if (typeof content === 'string') {
    body.innerHTML = content;
  } else {
    body.appendChild(content);
  }

  section.appendChild(body);
  return section;
}

// ─── Icon SVGs ────────────────────────────────────────────────────

const iconSVG = (d, extra = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ${extra}><path d="${d}"/></svg>`;

const iconSummary = () => iconSVG('M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z');
const iconThemes = () => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/></svg>`;
const iconSentiment = () => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/></svg>`;
const iconFindings = () => iconSVG('M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4');
const iconRecommendations = () => iconSVG('M13 10V3L4 14h7v7l9-11h-7z');
const iconDrivers = () => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>`;
const iconTone = () => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;
const iconQuotes = () => iconSVG('M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z');
const iconCheck = () => `<svg viewBox="0 0 20 20" fill="currentColor" width="17" height="17"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>`;
const iconMarketResearch = () => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35M8 11a3 3 0 006 0 3 3 0 00-6 0"/></svg>`;

// ─── DOM utilities ────────────────────────────────────────────────

function el(tag, attrs = {}, html = '') {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'class') node.className = v;
    else node.setAttribute(k, v);
  });
  node.innerHTML = html;
  return node;
}

function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
