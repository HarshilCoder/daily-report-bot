// appscript.js
// Calls the Apps Script Web App and returns a PDF Buffer.
// Includes a longer timeout and one automatic retry, since larger
// ranges (more rows/columns) take noticeably longer to export than
// small ones, and Apps Script cold-starts can occasionally be slow.

const axios = require('axios');
require('dotenv').config();

/**
 * Makes the actual HTTP request to the Apps Script Web App,
 * retrying once if the first attempt times out.
 */
async function fetchWithRetry(url, params, attempt = 1) {
  try {
    return await axios.get(url, {
      params,
      responseType: 'text', // Apps Script returns base64 text, not binary
      timeout: 120000 // 2 minutes — larger ranges take longer to export
    });
  } catch (err) {
    const isTimeout = err.code === 'ECONNABORTED';
    if (isTimeout && attempt < 2) {
      console.warn(`[appscript] Timeout on attempt ${attempt}, retrying...`);
      return fetchWithRetry(url, params, attempt + 1);
    }
    throw err;
  }
}

/**
 * Fetches the exported PDF for a given range from the Apps Script Web App.
 * @param {Object} params
 * @param {string} params.spreadsheetId
 * @param {string} params.sheetName
 * @param {string} params.range
 * @returns {Promise<Buffer>} PDF file as a Buffer
 */
async function fetchReportPdf({ spreadsheetId, sheetName, range }) {
  const url = process.env.APPSCRIPT_URL;
  const secret = process.env.APPSCRIPT_SECRET;

  if (!url || !secret) {
    throw new Error('Missing APPSCRIPT_URL or APPSCRIPT_SECRET in .env');
  }

  console.log('[appscript] Requesting PDF export...', { spreadsheetId, sheetName, range });

  let response;
  try {
    response = await fetchWithRetry(url, { spreadsheetId, sheetName, range, secret });
  } catch (err) {
    throw new Error(`Failed to reach Apps Script Web App: ${err.message}`);
  }

  const base64Data = response.data;

  // Defensive checks — Apps Script returns plain error text on failure,
  // which won't be valid base64/PDF. Catch that early with a clear message.
  if (!base64Data || typeof base64Data !== 'string') {
    throw new Error('Apps Script returned an empty or invalid response.');
  }

  if (base64Data.startsWith('Error:') || base64Data === 'Unauthorized') {
    throw new Error(`Apps Script returned an error: ${base64Data}`);
  }

  const pdfBuffer = Buffer.from(base64Data, 'base64');

  // Sanity check: valid PDFs start with "%PDF-"
  if (pdfBuffer.slice(0, 5).toString() !== '%PDF-') {
    throw new Error('Decoded data does not look like a valid PDF. Check Apps Script logs.');
  }

  console.log(`[appscript] PDF received successfully (${pdfBuffer.length} bytes).`);

  return pdfBuffer;
}
// NEW — separate, optional function for the AI insight feature
async function fetchReportValues({ spreadsheetId, sheetName, range }) {
  const url = process.env.APPSCRIPT_URL;
  const secret = process.env.APPSCRIPT_SECRET;

  const response = await axios.get(url, {
    params: { spreadsheetId, sheetName, range, secret, mode: 'values' },
    responseType: 'text',
    timeout: 60000
  });

  const parsed = JSON.parse(response.data);
  if (parsed.error) throw new Error(parsed.error);
  return parsed.values || [];
}

module.exports = { fetchReportPdf, fetchReportValues };