const mammoth = require('mammoth');
const { parse } = require('csv-parse/sync');

/**
 * Parse a CSV buffer into a single text block of feedback entries.
 * Handles both single-column and multi-column CSVs.
 */
function parseCSV(buffer) {
  const content = buffer.toString('utf-8');
  let records;

  try {
    records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      relax_quotes: true,
      trim: true,
    });
  } catch {
    // Fall back to no-header mode
    records = parse(content, {
      columns: false,
      skip_empty_lines: true,
      relax_quotes: true,
      trim: true,
    });
    return records
      .flat()
      .filter(Boolean)
      .join('\n');
  }

  if (!records.length) return '';

  // Identify the most likely feedback column (longest avg text)
  const keys = Object.keys(records[0]);
  const feedbackKey = keys.reduce((best, key) => {
    const avg = records.reduce((sum, r) => sum + (r[key] || '').length, 0) / records.length;
    const bestAvg = records.reduce((sum, r) => sum + (r[best] || '').length, 0) / records.length;
    return avg > bestAvg ? key : best;
  }, keys[0]);

  // If one dominant text column, extract it; otherwise concat all columns
  const dominantAvg = records.reduce((sum, r) => sum + (r[feedbackKey] || '').length, 0) / records.length;
  const allText = keys.map(k => records.reduce((sum, r) => sum + (r[k] || '').length, 0) / records.length);
  const totalAvg = allText.reduce((a, b) => a + b, 0);

  let lines;
  if (keys.length === 1 || dominantAvg / totalAvg > 0.6) {
    lines = records.map(r => r[feedbackKey]).filter(Boolean);
  } else {
    lines = records.map(r =>
      keys.map(k => r[k]).filter(Boolean).join(' | ')
    ).filter(Boolean);
  }

  return lines.join('\n');
}

/**
 * Parse a DOCX buffer and return extracted plain text.
 */
async function parseDOCX(buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return result.value.trim();
}

/**
 * Route a file buffer to the appropriate parser based on mimetype / extension.
 */
async function parseFile(file) {
  const { originalname, mimetype, buffer } = file;
  const ext = originalname.split('.').pop().toLowerCase();

  if (ext === 'csv' || mimetype === 'text/csv') {
    return parseCSV(buffer);
  }

  if (ext === 'docx' || mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return parseDOCX(buffer);
  }

  if (ext === 'txt' || mimetype === 'text/plain') {
    return buffer.toString('utf-8').trim();
  }

  throw new Error(`Unsupported file type: .${ext}. Please upload a .txt, .csv, or .docx file.`);
}

module.exports = { parseFile };
