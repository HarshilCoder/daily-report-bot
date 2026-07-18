// server.js
// Always-on webhook server. Listens for incoming WhatsApp messages,
// matches the message text against reports.json, and replies with
// the matching report image — sent back to whoever messaged.

const express = require('express');
const { runReport } = require('./index');
const { loadReports, findReportByTrigger } = require('./reports');
const { sendReportImage, sendTextMessage } = require('./whatsapp');

const app = express();
app.use(express.json());

const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN;

// Webhook verification (Meta calls this once when you save the config)
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[webhook] Verified successfully.');
    return res.status(200).send(challenge);
  }

  console.warn('[webhook] Verification failed — token mismatch.');
  return res.sendStatus(403);
});

// Privacy policy page (required by Meta to enable Live mode)
app.get('/privacy-policy', (req, res) => {
  res.send(`
    <html>
      <head><title>Privacy Policy - Daily Report Bot</title></head>
      <body style="font-family: sans-serif; max-width: 600px; margin: 40px auto; line-height: 1.6;">
        <h1>Privacy Policy</h1>
        <p>This internal tool generates and sends report images via WhatsApp on request. It does not collect, store, or share any personal data beyond what is necessary to deliver messages via the WhatsApp Business API.</p>
        <p>Report content is sourced directly from private Google Sheets accessible only to authorized team members.</p>
        <p>Last updated: ${new Date().toLocaleDateString('en-IN')}</p>
      </body>
    </html>
  `);
});

// Incoming message handler
app.post('/webhook', async (req, res) => {
  // Ack immediately — Meta expects a fast response and retries if we're slow.
  res.sendStatus(200);

  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const messages = change?.value?.messages;

    if (!messages || messages.length === 0) {
      // Status update (delivered/read), not a new message — ignore.
      return;
    }

    const incoming = messages[0];
    const fromNumber = incoming.from;
    const text = incoming.text?.body?.trim().toLowerCase() || '';

    console.log(`[webhook] Message from ${fromNumber}: "${text}"`);

    // Help / menu command
    if (!text || text === 'menu' || text === 'help') {
      const reports = loadReports();
      const list = reports.map(r => `• *${r.trigger}* — ${r.label}`).join('\n');
      await sendTextMessage(fromNumber, `📊 Available reports — reply with a keyword:\n\n${list}`);
      return;
    }

    // Look up matching report
    const report = findReportByTrigger(text);
    if (!report) {
      await sendTextMessage(
        fromNumber,
        `❓ No report found for "${text}". Type *menu* to see available reports.`
      );
      return;
    }

    await sendTextMessage(fromNumber, `⏳ Generating "${report.label}"...`);

    const pngPath = await runReport(report);
    const caption = `📊 ${report.label} — ${new Date().toLocaleDateString('en-IN')}`;
    await sendReportImage(pngPath, caption, fromNumber);

    console.log(`[webhook] Report "${report.id}" sent to ${fromNumber}.`);

  } catch (err) {
    console.error('[webhook] Failed to process message:', err.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[server] Webhook server listening on port ${PORT}`);
});