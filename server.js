// server.js
const express = require('express');
const crypto = require('crypto');
const { runReport } = require('./index');
const {
  loadReports,
  loadBundles,
  findReportByTrigger,
  findReportById,
  findBundleByTrigger
} = require('./reports');
const { sendReportImage, sendTextMessage } = require('./whatsapp');

const app = express();

const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN;
const APP_SECRET = process.env.APP_SECRET;

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

app.get('/privacy-policy', (req, res) => {
  res.send(`
    <html><body style="font-family: sans-serif; max-width: 600px; margin: 40px auto; line-height: 1.6;">
      <h1>Privacy Policy</h1>
      <p>This internal tool generates and sends report images via WhatsApp on request. It does not collect, store, or share any personal data beyond what is necessary to deliver messages via the WhatsApp Business API.</p>
      <p>Last updated: ${new Date().toLocaleDateString('en-IN')}</p>
    </body></html>
  `);
});

app.get('/health', (req, res) => res.status(200).send('OK'));

function verifySignature(req) {
  const signatureHeader = req.headers['x-hub-signature-256'];
  if (!signatureHeader || !APP_SECRET) return false;

  const expectedHash = crypto.createHmac('sha256', APP_SECRET).update(req.rawBody).digest('hex');
  const expectedSignature = `sha256=${expectedHash}`;

  const sigBuffer = Buffer.from(signatureHeader);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (sigBuffer.length !== expectedBuffer.length) return false;

  return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
}

async function safeSendError(toNumber, message) {
  try {
    await sendTextMessage(toNumber, message);
  } catch (err) {
    console.error('[webhook] Also failed to send error notification:', err.message);
  }
}

/** Runs one report and sends it to the given number. Throws on failure. */
async function sendOneReport(report, toNumber) {
  const pngPath = await runReport(report);
  const caption = `📊 ${report.label} — ${new Date().toLocaleDateString('en-IN')}`;
  await sendReportImage(pngPath, caption, toNumber);
}

app.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    req.rawBody = req.body;

    if (!verifySignature(req)) {
      console.warn('[webhook] Signature verification FAILED — rejecting request.');
      return res.sendStatus(403);
    }

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
      if (!messages || messages.length === 0) return;

      const incoming = messages[0];
      const fromNumber = incoming.from;
      const text = incoming.text?.body?.trim().toLowerCase() || '';

      console.log(`[webhook] Message from ${fromNumber}: "${text}"`);

      // Help / menu command — lists both single reports and bundles
      if (!text || text === 'menu' || text === 'help') {
        try {
          const reports = loadReports();
          const bundles = loadBundles();
          const reportList = reports.map(r => `• *${r.trigger}* — ${r.label}`).join('\n');
          const bundleList = bundles.map(b => `• *${b.trigger}* — ${b.label} (${b.reportIds.length} reports)`).join('\n');
          const message = `📊 Available reports:\n\n${reportList}` +
            (bundles.length ? `\n\n📦 Bundles:\n\n${bundleList}` : '');
          await sendTextMessage(fromNumber, message);
        } catch (err) {
          console.error('[webhook] Failed to send menu:', err.message);
          await safeSendError(fromNumber, 'Something went wrong loading the menu. Please try again shortly.');
        }
        return;
      }

      // Check bundles first (multi-word triggers like "morning report")
      const bundle = findBundleByTrigger(text);
      if (bundle) {
        await sendTextMessage(fromNumber, `⏳ Generating ${bundle.reportIds.length} reports for "${bundle.label}"...`);

        for (const reportId of bundle.reportIds) {
          const report = findReportById(reportId);
          if (!report) {
            console.warn(`[webhook] Bundle "${bundle.trigger}" references unknown report id "${reportId}"`);
            continue;
          }
          try {
            await sendOneReport(report, fromNumber);
            console.log(`[webhook] Bundle report "${report.id}" sent to ${fromNumber}.`);
          } catch (err) {
            console.error(`[webhook] Bundle report "${report.id}" failed:`, err.message);
            await safeSendError(fromNumber, `⚠️ Couldn't generate "${report.label}" (part of ${bundle.label}). Continuing with the rest...`);
          }
        }
        return;
      }

      // Single report match
      const report = findReportByTrigger(text);
      if (!report) {
        await safeSendError(fromNumber, `❓ No report found for "${text}". Type *menu* to see available reports.`);
        return;
      }

      try {
        await sendTextMessage(fromNumber, `⏳ Generating "${report.label}"...`);
        await sendOneReport(report, fromNumber);
        console.log(`[webhook] Report "${report.id}" sent to ${fromNumber}.`);
      } catch (err) {
        console.error(`[webhook] Failed to generate/send report "${report.id}":`, err.message);
        await safeSendError(
          fromNumber,
          `⚠️ Couldn't generate "${report.label}" right now. Please try again in a moment.`
        );
      }

    } catch (err) {
      console.error('[webhook] Unexpected error processing message:', err.message);
    }
  }
);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[server] Webhook server listening on port ${PORT}`);
});