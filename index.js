// index.js
// Generic report pipeline: Sheet range -> PDF -> PNG
// Called per-report by server.js, passing in a report definition from reports.json

const fs = require('fs');
const path = require('path');
const { fetchReportPdf } = require('./appscript');
const { convertPdfToPng } = require('./convert');

const TEMP_DIR = path.join(__dirname, 'temp');
const OUTPUT_DIR = path.join(__dirname, 'output');

function ensureDirs() {
  [TEMP_DIR, OUTPUT_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

/**
 * Runs the PDF -> PNG pipeline for a given report definition.
 * @param {Object} report - one entry from reports.json
 * @param {string} report.id
 * @param {string} report.label
 * @param {string} report.spreadsheetId
 * @param {string} report.sheetName
 * @param {string} report.range
 * @returns {Promise<string>} path to the generated PNG
 */
async function runReport(report) {
  ensureDirs();
  const startTime = Date.now();
  const uniqueName = `${report.id}_${Date.now()}`; // avoids collisions between simultaneous requests

  console.log(`[index] Running report "${report.label}" (${report.id})`);

  try {
    const pdfBuffer = await fetchReportPdf({
      spreadsheetId: report.spreadsheetId,
      sheetName: report.sheetName,
      range: report.range
    });

    const pdfPath = path.join(TEMP_DIR, `${uniqueName}.pdf`);
    fs.writeFileSync(pdfPath, pdfBuffer);
    console.log('[index] PDF saved:', pdfPath);

    const pngPath = await convertPdfToPng(pdfPath, uniqueName, OUTPUT_DIR);
    console.log('[index] PNG saved:', pngPath);

    const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[index] Report "${report.label}" completed in ${durationSec}s`);

    return pngPath;

  } catch (err) {
    const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`[index] Report "${report.label}" FAILED after ${durationSec}s:`, err.message);
    throw err;
  }
}

module.exports = { runReport };