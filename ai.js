// ai.js
// Wraps Google's Gemini API (free tier) for two features:
// 1. Generating a smart one-line insight caption from report data
// 2. Interpreting free-text WhatsApp messages that don't match an exact keyword

const axios = require('axios');
require('dotenv').config();

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

async function callGemini(promptText) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Missing GEMINI_API_KEY');

  const response = await axios.post(
    `${GEMINI_URL}?key=${apiKey}`,
    { contents: [{ parts: [{ text: promptText }] }] },
    { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }
  );

  const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return (text || '').trim();
}

/**
 * Generates a short, specific insight caption from the report's raw values.
 * Returns null on any failure — caller should fall back to a plain caption.
 */
async function generateInsightCaption(reportLabel, values) {
  try {
    if (!values || values.length === 0) return null;

    const dataText = values.map(row => row.join(' | ')).join('\n');
    const prompt = `Summarize this business report table in ONE short sentence (max 20 words) for a WhatsApp caption. Mention a specific number or trend if useful. No preamble, just the sentence.\n\nReport: ${reportLabel}\n\nData:\n${dataText}`;

    const caption = await callGemini(prompt);
    return caption || null;
  } catch (err) {
    console.error('[ai] Caption generation failed:', err.message);
    return null;
  }
}

/**
 * Interprets a free-text message and matches it to the closest report/bundle.
 * Returns { kind: 'report'|'bundle', trigger: string } or null if no match.
 */
async function matchReportByIntent(userText, reports, bundles) {
  try {
    const optionsText = [
      ...reports.map(r => `report:${r.trigger} - ${r.label}`),
      ...bundles.map(b => `bundle:${b.trigger} - ${b.label}`)
    ].join('\n');

    const prompt = `A user sent this WhatsApp message: "${userText}"\n\nAvailable options (format "type:trigger - label"):\n${optionsText}\n\nWhich single option best matches the user's intent? Reply with ONLY the exact "type:trigger" text (e.g. "report:gujarat"). If nothing reasonably matches, reply exactly: none`;

    const result = (await callGemini(prompt)).toLowerCase().trim();
    if (result === 'none' || !result.includes(':')) return null;

    const [kind, ...rest] = result.split(':');
    const trigger = rest.join(':').trim();
    if (kind !== 'report' && kind !== 'bundle') return null;

    return { kind, trigger };
  } catch (err) {
    console.error('[ai] Intent matching failed:', err.message);
    return null;
  }
}

module.exports = { generateInsightCaption, matchReportByIntent };