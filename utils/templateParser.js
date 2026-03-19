/* ═══════════════════════════════════════════════════════════════
   Template Parser — utils/templateParser.js
   Accepts a .pptx file buffer, extracts color/font theme
   from ppt/theme/theme1.xml and returns a theme object in the
   same format used by the presentation agent.
   ═══════════════════════════════════════════════════════════════ */

const AdmZip    = require('adm-zip');
const { XMLParser } = require('fast-xml-parser');

// ─── Relative luminance (WCAG formula) ─────────────────────────────────────

function getLuminance(hex) {
  if (!hex || hex.length < 6) return 0.5;
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  const toLinear = c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

// ─── Normalise hex: strip #, uppercase, fallback ───────────────────────────

function normHex(val, fallback) {
  if (!val) return fallback;
  const clean = String(val).replace(/^#/, '').toUpperCase();
  return /^[0-9A-F]{6}$/.test(clean) ? clean : fallback;
}

// ─── Extract a color entry from the clrScheme node ────────────────────────
// pptx theme colors can be stored as <a:srgbClr val="RRGGBB"/>
// or as <a:sysClr lastClr="RRGGBB"/> for system-mapped colors.

function extractColor(entry) {
  if (!entry) return null;
  const srgb = entry['a:srgbClr'];
  if (srgb) return normHex(srgb['@_val'], null);
  const sys  = entry['a:sysClr'];
  if (sys)  return normHex(sys['@_lastClr'], null);
  return null;
}

// ─── Main export ──────────────────────────────────────────────────────────

function extractThemeFromPptx(buffer) {
  let zip;
  try {
    zip = new AdmZip(buffer);
  } catch {
    throw new Error('Could not read file as a .pptx archive.');
  }

  // Read theme XML
  const themeEntry = zip.getEntry('ppt/theme/theme1.xml');
  if (!themeEntry) throw new Error('No theme found in this .pptx file (ppt/theme/theme1.xml missing).');
  const themeXml = themeEntry.getData().toString('utf8');

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseAttributeValue: false,
  });
  const doc = parser.parse(themeXml);

  // Navigate: a:theme > a:themeElements > a:clrScheme / a:fontScheme
  const root         = doc['a:theme']        || {};
  const elements     = root['a:themeElements']   || {};
  const clrScheme    = elements['a:clrScheme']   || {};
  const fontScheme   = elements['a:fontScheme']  || {};

  // Extract named colors
  const c = {
    dk1:     extractColor(clrScheme['a:dk1'])     || '000000',
    lt1:     extractColor(clrScheme['a:lt1'])     || 'FFFFFF',
    dk2:     extractColor(clrScheme['a:dk2'])     || '44546A',
    lt2:     extractColor(clrScheme['a:lt2'])     || 'E7E6E6',
    accent1: extractColor(clrScheme['a:accent1']) || '4472C4',
    accent2: extractColor(clrScheme['a:accent2']) || 'ED7D31',
    accent3: extractColor(clrScheme['a:accent3']) || 'A9D18E',
    accent4: extractColor(clrScheme['a:accent4']) || 'FFC000',
    accent5: extractColor(clrScheme['a:accent5']) || '5A96C8',
    accent6: extractColor(clrScheme['a:accent6']) || '70AD47',
  };

  // Extract font face (prefer minor/body font; fall back to major/heading)
  let fontFace = 'Calibri';
  const minorFont = fontScheme['a:minorFont'] || fontScheme['a:majorFont'] || {};
  const latin = minorFont['a:latin'];
  if (latin?.['@_typeface'] && latin['@_typeface'] !== '+mj-lt' && latin['@_typeface'] !== '+mn-lt') {
    fontFace = latin['@_typeface'];
  }
  // Keep only safe, common fonts that render in PowerPoint + Google Slides
  const safeFonts = ['Calibri', 'Arial', 'Segoe UI', 'Helvetica', 'Times New Roman', 'Georgia', 'Verdana', 'Trebuchet MS'];
  if (!safeFonts.some(f => fontFace.toLowerCase().startsWith(f.toLowerCase()))) {
    fontFace = 'Calibri';
  }

  // Decide dark vs light from lt1 luminance
  const bgLum = getLuminance(c.lt1);
  const isDark = bgLum < 0.4;

  let bgColor, textColor, mutedText, cardBg, cardBorder;

  if (isDark) {
    bgColor    = c.dk1 === '000000' ? c.lt1 : c.dk1;   // dark theme: use the dark base
    textColor  = c.lt1;
    mutedText  = c.dk2;
    cardBg     = blendHex(bgColor, 'FFFFFF', 0.08);
    cardBorder = blendHex(bgColor, 'FFFFFF', 0.12);
  } else {
    bgColor    = c.lt1;
    textColor  = c.dk1 === '000000' ? c.dk1 : c.dk1;
    mutedText  = c.dk2;
    cardBg     = 'FFFFFF';
    cardBorder = c.lt2;
  }

  return {
    name:            'custom_template',
    bgColor:         normHex(bgColor,       'F8FAFC'),
    accentColor:     normHex(c.accent1,     '6366F1'),
    secondaryAccent: normHex(c.accent2,     '0EA5E9'),
    textColor:       normHex(textColor,     '0F172A'),
    mutedText:       normHex(mutedText,     '64748B'),
    cardBg:          normHex(cardBg,        'FFFFFF'),
    cardBorder:      normHex(cardBorder,    'E2E8F0'),
    positiveColor:   '22C55E',
    negativeColor:   'EF4444',
    neutralColor:    'EAB308',
    fontFace,
  };
}

// ─── Simple color blend (mix hex A toward hex B at weight w=0..1) ─────────

function blendHex(hexA, hexB, w) {
  const parse = h => [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
  const a = parse(hexA.padEnd(6, '0'));
  const b = parse(hexB.padEnd(6, '0'));
  return a.map((v, i) => Math.round(v + (b[i] - v) * w))
           .map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0'))
           .join('').toUpperCase();
}

module.exports = { extractThemeFromPptx };
