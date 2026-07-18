// server.js
// Always-on webhook server. Listens for incoming WhatsApp messages
// and automatically replies with today's report image.

const express = require('express');
const { runDailyReport } = require('./index');

const app = express();
app.use(express.json());

const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN;

// 1. Meta calls this once via GET to verify your webhook URL during setup
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

// 2. Meta calls this via POST every time a message event happens
app.post('/webhook', async (req, res) => {
  // Always respond 200 immediately — Meta expects a fast ack,
  // and will retry aggressively if we're slow/silent.
  res.sendStatus(200);

  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const messages = change?.value?.messages;

    if (!messages || messages.length === 0) {
      // This POST was a status update (delivered/read), not a new message — ignore it.
      return;
    }

    const incomingMessage = messages[0];
    const fromNumber = incomingMessage.from;

    console.log(`[webhook] Incoming message from ${fromNumber}, triggering report...`);

    // Reuse the exact same pipeline from index.js
    await runDailyReport();

    console.log(`[webhook] Report sent successfully to ${fromNumber}.`);

  } catch (err) {
    console.error('[webhook] Failed to process incoming message:', err.message);
  }
});

const PORT = process.env.PORT || 3000;
// Simple static privacy policy page — required by Meta to enable Live mode
app.get('/privacy-policy', (req, res) => {
  res.send(`
    <html>
      <head><title>Privacy Policy - DailyReportBot</title></head>
      <body style="font-family: sans-serif; max-width: 600px; margin: 40px auto; line-height: 1.6;">
        <h1>Privacy Policy</h1>
        <p>DailyReportBot is a personal automation tool that generates and sends daily report images via WhatsApp.</p>
        <p>This application does not collect, store, or share any personal data beyond what is necessary to send report messages via the WhatsApp Business API. No data is sold or shared with third parties.</p>
        <p>Report content is sourced directly from a private Google Sheet and is not accessible to anyone outside the application owner.</p>
        <p>For questions, contact the application owner directly.</p>
        <p>Last updated: ${new Date().toLocaleDateString('en-IN')}</p>
      </body>
    </html>
  `);
});
app.listen(PORT, () => {
  console.log(`[server] Webhook server listening on port ${PORT}`);
});