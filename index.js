// index.js
// Full daily pipeline: Sheet range → PDF → PNG → WhatsApp
// Run manually with `node index.js`, or hook into a scheduler later.

const fs = require('fs');
const path = require('path');
const config = require('./config');
const { fetchReportPdf } = require('./appscript');
const { convertPdfToPng } = require('./convert');
const { sendReportImage } = require('./whatsapp');

const TEMP_DIR = path.join(__dirname, 'temp');
const OUTPUT_DIR = path.join(__dirname, 'output');

function ensureDirs() {
  [TEMP_DIR, OUTPUT_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

async function runDailyReport() {
  const startTime = Date.now();
  console.log('========================================');
  console.log(`[index] Starting daily report run — ${new Date().toISOString()}`);
  console.log('[index] Config:', config);
  console.log('========================================');

  ensureDirs();

  try {
    // Step 1: Fetch PDF from Apps Script
    console.log('\n[index] STEP 1/3 — Fetching PDF from Google Sheets...');
    const pdfBuffer = await fetchReportPdf(config);
    const pdfPath = path.join(TEMP_DIR, `${config.outputName}.pdf`);
    fs.writeFileSync(pdfPath, pdfBuffer);
    console.log('[index] PDF saved:', pdfPath);

    // Step 2: Convert PDF to PNG
    console.log('\n[index] STEP 2/3 — Converting PDF to PNG...');
    const pngPath = await convertPdfToPng(pdfPath, config.outputName, OUTPUT_DIR);
    console.log('[index] PNG saved:', pngPath);

    // Step 3: Send via WhatsApp
    console.log('\n[index] STEP 3/3 — Sending via WhatsApp...');
    const caption = `📊 ${config.outputName} — ${new Date().toLocaleDateString('en-IN')}`;
    const sendResult = await sendReportImage(pngPath, caption);
    console.log('[index] WhatsApp send confirmed. Message ID:', sendResult.messages?.[0]?.id);

    const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('\n========================================');
    console.log(`✅ [index] Daily report completed successfully in ${durationSec}s`);
    console.log('========================================');

    return { success: true, pdfPath, pngPath, sendResult };

  } catch (err) {
    const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error('\n========================================');
    console.error(`❌ [index] Daily report FAILED after ${durationSec}s`);
    console.error('[index] Error:', err.message);
    console.error('========================================');

    // Re-throw so a scheduler/process manager can detect failure (non-zero exit code)
    throw err;
  }
}

// Run immediately if this file is executed directly (not imported as a module)
if (require.main === module) {
  runDailyReport()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { runDailyReport };