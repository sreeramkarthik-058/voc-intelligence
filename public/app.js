/* ═══════════════════════════════════════════════════════════════
   Customer Sentiment Analysis — Frontend Logic
   ═══════════════════════════════════════════════════════════════ */

// ─── Dark mode ────────────────────────────────────────────────────

function initDarkMode() {
  const saved = localStorage.getItem('voc-theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = saved === 'dark' || (!saved && prefersDark);
  if (isDark) applyDarkMode(true, false);
}

function applyDarkMode(dark, save = true) {
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  const btn = document.getElementById('dark-toggle');
  if (btn) btn.setAttribute('aria-pressed', dark ? 'true' : 'false');
  if (save) localStorage.setItem('voc-theme', dark ? 'dark' : 'light');
}

initDarkMode();

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('dark-toggle');
  if (btn) {
    btn.addEventListener('click', () => {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      applyDarkMode(!isDark);
    });
  }
});

// ─── Count-up animation ───────────────────────────────────────────

function countUp(el, target, duration = 900) {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reducedMotion) {
    el.textContent = Number.isInteger(target) ? target : target.toFixed(1);
    return;
  }
  const start = performance.now();
  const isDecimal = !Number.isInteger(target);
  function tick(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = target * eased;
    el.textContent = isDecimal ? current.toFixed(1) : Math.round(current);
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// ─── Metric cards row ─────────────────────────────────────────────

function renderMetricCards(report) {
  const row = document.getElementById('metrics-row');
  if (!row) return;

  const { analysisType, data } = report;

  // Extract values
  let score = null, negPct = null, themesCount = null;

  if (analysisType === 'both') {
    score       = data.sentiment?.overall?.score ?? null;
    negPct      = data.sentiment?.breakdown?.negative ?? null;
    themesCount = (data.themes?.list || []).length || null;
  } else if (analysisType === 'sentiment') {
    score  = data.overall?.score ?? null;
    negPct = data.breakdown?.negative ?? null;
  } else if (analysisType === 'themes') {
    themesCount = (data.list || data.themes || []).length || null;
  }

  const scoreVal  = score    != null ? parseFloat(score) : null;
  const negVal    = negPct   != null ? parseInt(negPct, 10) : null;
  const themesVal = themesCount != null ? parseInt(themesCount, 10) : null;

  row.innerHTML = `
    <div class="metric-card">
      <div class="metric-value ${scoreVal != null ? 'metric-value--amber' : 'metric-value--muted'}" id="metric-score" aria-label="Sentiment score">${scoreVal != null ? '0.0' : 'N/A'}</div>
      <div class="metric-label">Sentiment Score</div>
    </div>
    <div class="metric-card">
      <div class="metric-value ${negVal != null ? 'metric-value--red' : 'metric-value--muted'}" id="metric-neg" aria-label="Negative feedback percentage">${negVal != null ? '0' : 'N/A'}</div>
      <div class="metric-label">Negative %</div>
    </div>
    <div class="metric-card">
      <div class="metric-value ${themesVal != null ? 'metric-value--purple' : 'metric-value--muted'}" id="metric-themes" aria-label="Number of themes identified">${themesVal != null ? '0' : 'N/A'}</div>
      <div class="metric-label">Themes Found</div>
    </div>
  `;
  row.classList.remove('hidden');

  // Trigger count-up on numeric values
  if (scoreVal  != null) countUp(document.getElementById('metric-score'),  scoreVal, 900);
  if (negVal    != null) countUp(document.getElementById('metric-neg'),    negVal,   700);
  if (themesVal != null) countUp(document.getElementById('metric-themes'), themesVal, 600);
}

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
    const btn = $('analyze-btn');
    btn.disabled = false;
    btn.removeAttribute('aria-disabled');
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
    renderMetricCards(json);
    showPresentationSection();
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
  const analyzeBtn = $('analyze-btn');
  analyzeBtn.disabled = true;
  analyzeBtn.setAttribute('aria-disabled', 'true');
  state.selectedFile = null;
  fileInput.value = '';
  updateDropZone(null);
  // Hide presentation section and metrics
  $('presentation-section').classList.add('hidden');
  const metricsRow = $('metrics-row');
  if (metricsRow) { metricsRow.classList.add('hidden'); metricsRow.innerHTML = ''; }
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
  lines.push('CUSTOMER SENTIMENT ANALYSIS REPORT');
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
      <span>Customer Sentiment Analysis Report</span>
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
  section.className = 'report-section fade-up';

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

/* ═══════════════════════════════════════════════════════════════
   Presentation Agent — Frontend Logic
   ═══════════════════════════════════════════════════════════════ */

// ─── Presentation state ───────────────────────────────────────────
const presState = {
  slides: [],
  theme: {},
  currentSlide: 0,
  pptxBase64: null,
  customTheme: null,   // set when user uploads a .pptx template
};

// ─── Show presentation section after report renders ───────────────
// Called from renderReport(); section appears but generate only fires on click.

function showPresentationSection() {
  const section = $('presentation-section');
  section.classList.remove('hidden');
  showPresPhase('input');
  $('pres-instructions').value = '';
  presState.customTheme = null;
  resetTemplateUpload();
  section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function showPresPhase(phase) {
  $('pres-input-phase').classList.toggle('hidden', phase !== 'input');
  $('pres-loading-phase').classList.toggle('hidden', phase !== 'loading');
  $('pres-viewer-phase').classList.toggle('hidden', phase !== 'viewer');
}

// ─── Theme picker + template upload ──────────────────────────────

document.querySelectorAll('input[name="presTheme"]').forEach(radio => {
  radio.addEventListener('change', () => {
    const zone = $('pres-template-zone');
    if (zone) zone.classList.toggle('hidden', radio.value !== 'template');
    if (radio.value !== 'template') {
      presState.customTheme = null;
      resetTemplateUpload();
    }
  });
});

// Focus dropdown — show custom text field when "Custom" selected
const focusSel = $('pres-focus');
if (focusSel) {
  focusSel.addEventListener('change', () => {
    const wrap = $('pres-custom-focus-wrap');
    if (wrap) wrap.style.display = focusSel.value === 'custom' ? '' : 'none';
  });
}

// Template dropzone
const templateDropzone = $('pres-template-dropzone');
const templateInput    = $('pres-template-input');

if (templateDropzone && templateInput) {
  templateDropzone.addEventListener('click', e => {
    if (e.target.tagName !== 'BUTTON') templateInput.click();
  });
  templateDropzone.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); templateInput.click(); }
  });
  templateDropzone.addEventListener('dragover', e => {
    e.preventDefault();
    templateDropzone.classList.add('drag-over');
  });
  templateDropzone.addEventListener('dragleave', () => templateDropzone.classList.remove('drag-over'));
  templateDropzone.addEventListener('drop', e => {
    e.preventDefault();
    templateDropzone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleTemplateFile(file);
  });
  templateInput.addEventListener('change', e => {
    if (e.target.files[0]) handleTemplateFile(e.target.files[0]);
  });
}

const removeTemplateBtn = $('pres-template-remove');
if (removeTemplateBtn) {
  removeTemplateBtn.addEventListener('click', e => {
    e.stopPropagation();
    presState.customTheme = null;
    resetTemplateUpload();
  });
}

async function handleTemplateFile(file) {
  if (!file.name.toLowerCase().endsWith('.pptx')) {
    showError('Template must be a .pptx file.');
    return;
  }
  // Show filename immediately
  const filename = $('pres-template-filename');
  if (filename) filename.textContent = file.name;
  const preview = $('pres-template-preview');
  if (preview) preview.classList.remove('hidden');
  templateDropzone.style.opacity = '0.5';
  templateDropzone.style.pointerEvents = 'none';

  try {
    const formData = new FormData();
    formData.append('template', file);
    const res  = await fetch('/api/template/extract', { method: 'POST', body: formData });
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.error || 'Failed to read template.');
    presState.customTheme = json.theme;
    renderTemplateSwatches(json.theme);
  } catch (err) {
    presState.customTheme = null;
    showError(err.message || 'Could not extract theme from template.');
    resetTemplateUpload();
  } finally {
    templateDropzone.style.opacity = '';
    templateDropzone.style.pointerEvents = '';
  }
}

function renderTemplateSwatches(theme) {
  const container = $('pres-template-swatches');
  if (!container) return;
  const colors = [
    { key: 'bgColor',     label: 'Background' },
    { key: 'accentColor', label: 'Accent' },
    { key: 'secondaryAccent', label: 'Secondary' },
    { key: 'textColor',   label: 'Text' },
  ];
  container.innerHTML = colors.map(({ key, label }) =>
    `<div class="pres-template-swatch" style="background:#${theme[key]||'ccc'}" title="${label}: #${theme[key]||'?'}"></div>`
  ).join('');
}

function resetTemplateUpload() {
  const preview = $('pres-template-preview');
  if (preview) preview.classList.add('hidden');
  if (templateInput) templateInput.value = '';
  const swatches = $('pres-template-swatches');
  if (swatches) swatches.innerHTML = '';
  if (templateDropzone) {
    templateDropzone.style.opacity = '';
    templateDropzone.style.pointerEvents = '';
  }
}

// ─── Build instructions string from form ─────────────────────────

function buildInstructionsFromForm() {
  const slideCount = ($('pres-slide-count')?.value || '6');
  const focusVal   = $('pres-focus')?.value || 'Executive summary';
  const focus      = focusVal === 'custom'
    ? ($('pres-custom-focus')?.value.trim() || 'Executive summary')
    : focusVal;

  const themeVal   = document.querySelector('input[name="presTheme"]:checked')?.value || 'dark';
  const themeLabel = themeVal === 'template' && presState.customTheme
    ? 'custom uploaded template style'
    : themeVal === 'light' ? 'futuristic light theme (bright background, dark text, indigo accent)'
    : 'futuristic dark theme (near-black background, indigo and cyan accents)';

  const extra = $('pres-instructions')?.value.trim();

  let parts = [
    `${slideCount} slides`,
    `Focus: ${focus}`,
    `Theme: ${themeLabel}`,
  ];
  if (extra) parts.push(extra);
  return parts.join('. ');
}

// ─── Generate presentation (fires only on button click) ───────────

$('generate-pres-btn').addEventListener('click', generatePresentation);

async function generatePresentation() {
  const instructions = buildInstructionsFromForm();
  if (!state.lastReport) return;

  // Validate template selection
  const themeVal = document.querySelector('input[name="presTheme"]:checked')?.value || 'dark';
  if (themeVal === 'template' && !presState.customTheme) {
    showError('Please upload a .pptx template file first, or choose a different theme.');
    return;
  }

  showPresPhase('loading');

  try {
    const res = await fetch('/api/presentation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        report: state.lastReport,
        instructions,
        customTheme: presState.customTheme || null,
      }),
    });

    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.error || 'Presentation generation failed.');

    presState.slides       = json.slides;
    presState.theme        = json.theme || {};
    presState.pptxBase64   = json.pptxBase64;
    presState.currentSlide = 0;

    renderSlideViewer();
    buildThumbnails();
    showPresPhase('viewer');

  } catch (err) {
    showPresPhase('input');
    showError(err.message || 'Presentation generation failed. Please try again.');
  }
}

// ─── Slide renderer ───────────────────────────────────────────────

function renderSlideViewer() {
  renderSlide(presState.currentSlide);
  updateSlideCounter();
  updateNavButtons();
}

// ─── Theme color resolver (adds # prefix for CSS) ─────────────────

function tc(name, theme) {
  // Resolve semantic names or raw hex
  const map = {
    positive:  theme.positiveColor  || '22C55E',
    negative:  theme.negativeColor  || 'EF4444',
    neutral:   theme.neutralColor   || 'EAB308',
    accent:    theme.accentColor    || '6366F1',
    secondary: theme.secondaryAccent|| '06B6D4',
    red_dot:   theme.negativeColor  || 'EF4444',
    yellow_dot:theme.neutralColor   || 'EAB308',
    purple_dot:theme.accentColor    || '6366F1',
    green_dot: theme.positiveColor  || '22C55E',
    blue_dot:  theme.secondaryAccent|| '06B6D4',
  };
  const hex = map[name] || name || theme.accentColor || '6366F1';
  return '#' + hex.replace(/^#/, '');
}

function renderSlide(index) {
  const slide    = presState.slides[index];
  const t        = presState.theme;
  const total    = presState.slides.length;
  const viewport = $('slide-viewport');
  const isDark   = isThemeDark(t);

  const bg      = '#' + (t.bgColor         || (isDark ? '0A0A1A' : 'F8FAFC'));
  const text    = '#' + (t.textColor        || (isDark ? 'FFFFFF' : '0F172A'));
  const muted   = '#' + (t.mutedText        || (isDark ? '9CA3AF' : '64748B'));
  const accent  = '#' + (t.accentColor      || '6366F1');
  const sec     = '#' + (t.secondaryAccent  || (isDark ? '06B6D4' : '0EA5E9'));
  const cardBg  = '#' + (t.cardBg           || (isDark ? '1A1A2E' : 'FFFFFF'));
  const numLbl  = index > 0 ? `<span style="position:absolute;bottom:6px;right:10px;font-size:9px;color:${muted};opacity:0.7">${index + 1} / ${total}</span>` : '';

  let html = '';

  switch (slide.type) {

    case 'title': {
      html = `
        <div class="pres-slide" style="background:${bg};color:${text};flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:10px;padding:24px">
          <div style="font-size:0.65rem;text-transform:uppercase;letter-spacing:0.12em;color:${muted}">Customer Sentiment Analysis</div>
          <h1 style="font-size:1.35rem;font-weight:800;line-height:1.2;max-width:90%;margin:0">${esc(slide.title || '')}</h1>
          ${slide.subtitle ? `<p style="font-size:0.82rem;color:${muted};margin:0;max-width:85%">${esc(slide.subtitle)}</p>` : ''}
          ${slide.accent ? `<div style="margin-top:4px;font-size:0.9rem;font-weight:700;color:${accent}">${esc(slide.accent)}</div>` : ''}
          <div style="width:60%;height:2px;background:${accent};border-radius:2px;margin-top:6px"></div>
        </div>`;
      break;
    }

    case 'stats': {
      const stats = (slide.stats || []).slice(0, 4);
      const cards = stats.map(s => {
        const color = tc(s.color, t);
        return `
          <div class="pres-stat-card" style="background:${cardBg};color:${text};border:1px solid #${t.cardBorder||'2D2D4E'}">
            <div style="position:absolute;left:0;top:0;bottom:0;width:4px;background:${color};border-radius:4px 0 0 4px"></div>
            <div class="pres-stat-value" style="color:${color}">${esc(String(s.value||''))}</div>
            <div class="pres-stat-label" style="color:${muted}">${esc(s.label||'')}</div>
          </div>`;
      }).join('');
      html = `
        <div class="pres-slide pres-slide-stats" style="background:${bg};color:${text};flex-direction:column;padding:12px 10px 8px;position:relative">
          <div style="font-size:0.62rem;text-transform:uppercase;letter-spacing:0.1em;color:${muted};padding:0 6px 8px">${esc(slide.title||'')}</div>
          <div class="pres-stats-grid">${cards}</div>
          ${slide.insight ? `<div class="pres-stat-insight" style="color:${muted}">${esc(slide.insight)}</div>` : ''}
          ${numLbl}
        </div>`;
      break;
    }

    case 'bullets': {
      const points = (slide.points || []).slice(0, 4);
      const rows = points.map(p => {
        const dot = typeof p === 'string' ? accent : tc((p.icon||'accent'), t);
        const txt = typeof p === 'string' ? p : (p.text || '');
        return `<li><span class="pres-dot" style="background:${dot}"></span><span>${esc(txt)}</span></li>`;
      }).join('');
      html = `
        <div class="pres-slide pres-slide-bullets" style="background:${bg};color:${text};flex-direction:column;padding:12px 10px 8px;position:relative">
          <div style="font-size:0.88rem;font-weight:700;padding:0 6px 6px;border-bottom:1px solid #${t.cardBorder||'2D2D4E'}">${esc(slide.title||'')}</div>
          <ul class="pres-bullets-list" style="color:${text}">${rows}</ul>
          ${slide.note ? `<div style="font-size:0.68rem;color:${muted};padding:4px 6px 2px;border-top:1px solid #${t.cardBorder||'2D2D4E'}">${esc(slide.note)}</div>` : ''}
          ${numLbl}
        </div>`;
      break;
    }

    case 'comparison': {
      const leftItems  = (slide.left?.items  || []).slice(0, 5);
      const rightItems = (slide.right?.items || []).slice(0, 5);
      const mkItems = items => items.map(item =>
        `<div class="pres-compare-item" style="color:${text}"><span class="pres-dot" style="background:${muted}"></span>${esc(item)}</div>`
      ).join('');
      html = `
        <div class="pres-slide" style="background:${bg};color:${text};flex-direction:column;padding:12px 10px 8px;position:relative">
          <div style="font-size:0.88rem;font-weight:700;padding:0 6px 8px">${esc(slide.title||'')}</div>
          <div class="pres-compare-grid" style="flex:1">
            <div class="pres-compare-col" style="background:${cardBg};border:1px solid #${t.cardBorder||'2D2D4E'}">
              <div class="pres-compare-header" style="background:${accent};color:#fff">${esc(slide.left?.label||'Strengths')}</div>
              <div class="pres-compare-items">${mkItems(leftItems)}</div>
            </div>
            <div class="pres-compare-col" style="background:${cardBg};border:1px solid #${t.cardBorder||'2D2D4E'}">
              <div class="pres-compare-header" style="background:${sec};color:#fff">${esc(slide.right?.label||'Weaknesses')}</div>
              <div class="pres-compare-items">${mkItems(rightItems)}</div>
            </div>
          </div>
          ${numLbl}
        </div>`;
      break;
    }

    case 'bar_chart': {
      const bars   = (slide.bars || []).slice(0, 6);
      const maxVal = Math.max(...bars.map(b => Number(b.value)||0), 1);
      const rows   = bars.map(b => {
        const pct   = Math.round((Number(b.value)||0) / maxVal * 100);
        const color = tc(b.color, t);
        return `
          <div class="pres-bar-row">
            <div class="pres-bar-label" style="color:${muted}">${esc(b.label||'')}</div>
            <div class="pres-bar-track" style="background:${cardBg}">
              <div class="pres-bar-fill" style="width:${pct}%;background:${color}"></div>
            </div>
            <div class="pres-bar-value" style="color:${text}">${esc(String(b.value||''))}</div>
          </div>`;
      }).join('');
      html = `
        <div class="pres-slide pres-slide-bar" style="background:${bg};color:${text};flex-direction:column;padding:12px 10px 8px;position:relative">
          <div style="font-size:0.88rem;font-weight:700;padding:0 6px 8px">${esc(slide.title||'')}</div>
          <div class="pres-bar-rows">${rows}</div>
          ${numLbl}
        </div>`;
      break;
    }

    case 'timeline': {
      const steps = (slide.steps || []).slice(0, 5);
      const nodes = steps.map((s, i) => `
        <div class="pres-timeline-step">
          <div class="pres-timeline-node" style="background:${i % 2 === 0 ? accent : sec}">${i + 1}</div>
          <div class="pres-timeline-text">
            <div class="pres-timeline-phase" style="color:${accent}">${esc(s.phase||'')}</div>
            <div class="pres-timeline-action" style="color:${text}">${esc(s.action||'')}</div>
            ${s.owner ? `<div class="pres-timeline-owner" style="color:${muted}">${esc(s.owner)}</div>` : ''}
          </div>
        </div>`).join('');
      html = `
        <div class="pres-slide pres-slide-timeline" style="background:${bg};color:${text};flex-direction:column;padding:12px 10px 8px;position:relative">
          <div style="font-size:0.88rem;font-weight:700;padding:0 6px 8px;border-bottom:1px solid #${t.cardBorder||'2D2D4E'}">${esc(slide.title||'Next Steps')}</div>
          <div class="pres-timeline-steps">${nodes}</div>
          ${numLbl}
        </div>`;
      break;
    }

    case 'quote': {
      const sentColor = slide.sentiment === 'positive' ? tc('positive', t)
        : slide.sentiment === 'negative' ? tc('negative', t) : tc('neutral', t);
      html = `
        <div class="pres-slide pres-slide-quote" style="background:${bg};color:${text};flex-direction:column;padding:0;position:relative">
          <div class="pres-quote-mark" style="color:${accent}">"</div>
          <div class="pres-quote-text" style="color:${text}">${esc(slide.quote||'')}</div>
          <div style="width:40%;height:1px;background:#${t.cardBorder||'2D2D4E'};margin:0 auto 0"></div>
          <div class="pres-quote-attribution" style="color:${muted};justify-content:center">
            <span class="pres-dot" style="background:${sentColor}"></span>
            ${esc(slide.attribution||'')}
          </div>
          ${numLbl}
        </div>`;
      break;
    }

    case 'section_divider': {
      html = `
        <div class="pres-slide pres-slide-divider" style="background:${bg};color:${text};position:relative">
          <div class="pres-divider-accent" style="background:${accent}"></div>
          <div class="pres-divider-title" style="color:${text}">${esc(slide.title||'')}</div>
          ${slide.subtitle ? `<div class="pres-divider-subtitle" style="color:${muted}">${esc(slide.subtitle)}</div>` : ''}
          <div class="pres-divider-accent" style="background:${sec}"></div>
          ${numLbl}
        </div>`;
      break;
    }

    default: {
      // Fallback: render as bullets
      const points = (slide.body || slide.points || []).slice(0, 4);
      const rows = points.map(p => {
        const txt = typeof p === 'string' ? p : (p.text || '');
        return `<li><span class="pres-dot" style="background:${accent}"></span><span>${esc(txt)}</span></li>`;
      }).join('');
      html = `
        <div class="pres-slide" style="background:${bg};color:${text};flex-direction:column;padding:12px 10px 8px;position:relative">
          <div style="font-size:0.88rem;font-weight:700;padding:0 6px 8px">${esc(slide.title||'')}</div>
          <ul class="pres-bullets-list" style="color:${text}">${rows}</ul>
          ${numLbl}
        </div>`;
    }
  }

  viewport.innerHTML = html;

  // Sync thumbnail highlight
  document.querySelectorAll('.slide-thumb').forEach((t, i) => {
    t.classList.toggle('active', i === index);
  });
}

function isThemeDark(theme) {
  const hex = theme.bgColor || '0A0A1A';
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum < 0.4;
}

function buildThumbnails() {
  const strip  = $('slide-thumbnails');
  const theme  = presState.theme;
  const bgHex  = '#' + (theme.bgColor    || '0A0A1A');
  const txtHex = '#' + (theme.textColor  || 'FFFFFF');
  const accHex = '#' + (theme.accentColor|| '6366F1');

  strip.innerHTML = '';
  presState.slides.forEach((slide, i) => {
    const isTitle  = slide.type === 'title';
    const thumbBg  = isTitle ? accHex : bgHex;
    const thumbTxt = '#' + (theme.textColor || 'FFFFFF');

    const thumb = document.createElement('button');
    thumb.className = 'slide-thumb' + (i === 0 ? ' active' : '');
    thumb.setAttribute('aria-label', `Slide ${i + 1}: ${slide.title || slide.type}`);
    thumb.innerHTML = `
      <div class="thumb-inner" style="background:${esc(thumbBg)}">
        <div class="thumb-title" style="color:${esc(thumbTxt)}">${esc(slide.title || slide.type || '')}</div>
        <div class="thumb-num">${i + 1}</div>
      </div>`;
    thumb.addEventListener('click', () => {
      presState.currentSlide = i;
      renderSlide(i);
      updateSlideCounter();
      updateNavButtons();
    });
    strip.appendChild(thumb);
  });
}

function updateSlideCounter() {
  $('slide-counter').textContent = `Slide ${presState.currentSlide + 1} of ${presState.slides.length}`;
}

function updateNavButtons() {
  $('prev-slide-btn').disabled = presState.currentSlide === 0;
  $('next-slide-btn').disabled = presState.currentSlide === presState.slides.length - 1;
}

// ─── Nav buttons ──────────────────────────────────────────────────

$('prev-slide-btn').addEventListener('click', () => {
  if (presState.currentSlide > 0) {
    presState.currentSlide--;
    renderSlide(presState.currentSlide);
    updateSlideCounter();
    updateNavButtons();
  }
});

$('next-slide-btn').addEventListener('click', () => {
  if (presState.currentSlide < presState.slides.length - 1) {
    presState.currentSlide++;
    renderSlide(presState.currentSlide);
    updateSlideCounter();
    updateNavButtons();
  }
});

// ─── Download .pptx ───────────────────────────────────────────────

$('download-pptx-btn').addEventListener('click', () => {
  if (!presState.pptxBase64) return;
  const byteChars = atob(presState.pptxBase64);
  const byteNums  = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteNums[i] = byteChars.charCodeAt(i);
  const blob = new Blob([byteNums], {
    type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  });
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = `voc-presentation-${Date.now()}.pptx`;
  a.click();
  URL.revokeObjectURL(url);
});

// ─── Regenerate ───────────────────────────────────────────────────

$('regenerate-pres-btn').addEventListener('click', () => {
  showPresPhase('input');
  $('pres-instructions').focus();
});

