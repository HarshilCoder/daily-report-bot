// server.js
const express = require('express');
const crypto = require('crypto');
const { runReport } = require('./index');
const { loadReports, findReportByTrigger } = require('./reports');
const { sendReportImage, sendTextMessage } = require('./whatsapp');

const app = express();

const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN;
const APP_SECRET = process.env.APP_SECRET;

// --- Webhook verification (Meta calls this once when you save the config) ---
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

// --- Privacy policy page ---
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

// --- Health check (useful later for uptime pings) ---
app.get('/health', (req, res) => res.status(200).send('OK'));

/**
 * Verifies the X-Hub-Signature-256 header against the raw request body.
 * Returns true only if the request genuinely came from Meta.
 */
function verifySignature(req) {
  const signatureHeader = req.headers['x-hub-signature-256'];
  if (!signatureHeader || !APP_SECRET) {
    return false;
  }

  const expectedHash = crypto
    .createHmac('sha256', APP_SECRET)
    .update(req.rawBody)
    .digest('hex');

  const expectedSignature = `sha256=${expectedHash}`;

  // timingSafeEqual prevents timing attacks; requires equal-length buffers
  const sigBuffer = Buffer.from(signatureHeader);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (sigBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
}

// --- Incoming message handler ---
// Use raw body parser here (not express.json()) so we can verify the signature
// against the exact bytes Meta signed, before any parsing happens.
app.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    req.rawBody = req.body; // Buffer, needed for signature check

    if (!verifySignature(req)) {
      console.warn('[webhook] Signature verification FAILED — rejecting request.');
      return res.sendStatus(403);
    }

    // Ack immediately once verified — Meta expects a fast response.
    res.sendStatus(200);

    let body;
    try {
      body = JSON.parse(req.rawBody.toString('utf8'));
    } catch (err) {
      console.error('[webhook] Failed to parse JSON body:', err.message);
      return;
    }

    try {
      const entry = body.entry?.[0];
      const change = entry?.changes?.[0];
      const messages = change?.value?.messages;

      if (!messages || messages.length === 0) {
        return; // status update, not a new message
      }

      const incoming = messages[0];
      const fromNumber = incoming.from;
      const text = incoming.text?.body?.trim().toLowerCase() || '';

      console.log(`[webhook] Message from ${fromNumber}: "${text}"`);

      // Help / menu command
      if (!text || text === 'menu' || text === 'help') {
        try {
          const reports = loadReports();
          const list = reports.map(r => `• *${r.trigger}* — ${r.label}`).join('\n');
          await sendTextMessage(fromNumber, `📊 Available reports — reply with a keyword:\n\n${list}`);
        } catch (err) {
          console.error('[webhook] Failed to send menu:', err.message);
          await safeSendError(fromNumber, 'Something went wrong loading the menu. Please try again shortly.');
        }
        return;
      }

      // Look up matching report
      const report = findReportByTrigger(text);
      if (!report) {
        await safeSendError(fromNumber, `❓ No report found for "${text}". Type *menu* to see available reports.`);
        return;
      }

      try {
        await sendTextMessage(fromNumber, `⏳ Generating "${report.label}"...`);

        const pngPath = await runReport(report);
        const caption = `📊 ${report.label} — ${new Date().toLocaleDateString('en-IN')}`;
        await sendReportImage(pngPath, caption, fromNumber);

        console.log(`[webhook] Report "${report.id}" sent to ${fromNumber}.`);

      } catch (err) {
        console.error(`[webhook] Failed to generate/send report "${report.id}":`, err.message);
        await safeSendError(
          fromNumber,
          `⚠️ Couldn't generate "${report.label}" right now. Please try again in a moment, or contact the system owner if this keeps happening.`
        );
      }

    } catch (err) {
      console.error('[webhook] Unexpected error processing message:', err.message);
    }
  }
);

/**
 * Sends an error message to the user, but never throws —
 * so a failure to notify the user doesn't crash anything further.
 */
async function safeSendError(toNumber, message) {
  try {
    await sendTextMessage(toNumber, message);
  } catch (err) {
    console.error('[webhook] Also failed to send error notification:', err.message);
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[server] Webhook server listening on port ${PORT}`);
});