// whatsapp.js
// Uploads local images to WhatsApp Cloud API and sends messages.
// Supports dynamic recipients so replies go back to whoever messaged the bot.

const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
require('dotenv').config();

const GRAPH_API_VERSION = 'v21.0';

/**
 * Uploads a local image file to WhatsApp Cloud API's media endpoint.
 * @param {string} imagePath
 * @returns {Promise<string>} media_id
 */
async function uploadMedia(imagePath) {
  const phoneNumberId = process.env.PHONE_NUMBER_ID;
  const accessToken = process.env.ACCESS_TOKEN;

  if (!fs.existsSync(imagePath)) {
    throw new Error(`Image not found at: ${imagePath}`);
  }

  console.log('[whatsapp] Uploading media...', { imagePath });

  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('file', fs.createReadStream(imagePath), { contentType: 'image/png' });

  let response;
  try {
    response = await axios.post(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/media`,
      form,
      {
        headers: { ...form.getHeaders(), Authorization: `Bearer ${accessToken}` },
        maxBodyLength: Infinity
      }
    );
  } catch (err) {
    const details = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    throw new Error(`Media upload failed: ${details}`);
  }

  const mediaId = response.data?.id;
  if (!mediaId) {
    throw new Error('Media upload succeeded but no media_id was returned.');
  }

  console.log('[whatsapp] Media uploaded, id:', mediaId);
  return mediaId;
}

/**
 * Sends an image message using a previously uploaded media_id.
 * @param {string} mediaId
 * @param {string} [caption]
 * @param {string} [toNumber] - if omitted, falls back to .env TO_NUMBER
 */
async function sendImageMessage(mediaId, caption = '', toNumber = null) {
  const phoneNumberId = process.env.PHONE_NUMBER_ID;
  const accessToken = process.env.ACCESS_TOKEN;
  const recipient = toNumber || process.env.TO_NUMBER;

  console.log('[whatsapp] Sending image message...', { toNumber: recipient, mediaId });

  let response;
  try {
    response = await axios.post(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to: recipient,
        type: 'image',
        image: { id: mediaId, caption }
      },
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    const details = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    throw new Error(`Send message failed: ${details}`);
  }

  console.log('[whatsapp] Message sent successfully.', response.data);
  return response.data;
}

/**
 * Convenience wrapper: upload + send in one call.
 * @param {string} imagePath
 * @param {string} [caption]
 * @param {string} [toNumber]
 */
async function sendReportImage(imagePath, caption = '', toNumber = null) {
  const mediaId = await uploadMedia(imagePath);
  return sendImageMessage(mediaId, caption, toNumber);
}

/**
 * Sends a plain text message (for menus, errors, confirmations).
 * @param {string} toNumber
 * @param {string} text
 */
async function sendTextMessage(toNumber, text) {
  const phoneNumberId = process.env.PHONE_NUMBER_ID;
  const accessToken = process.env.ACCESS_TOKEN;

  console.log('[whatsapp] Sending text message...', { toNumber });

  let response;
  try {
    response = await axios.post(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to: toNumber,
        type: 'text',
        text: { body: text }
      },
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    const details = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    throw new Error(`Send text failed: ${details}`);
  }

  console.log('[whatsapp] Text message sent successfully.');
  return response.data;
}
/**
 * Sends an interactive List Message — a tappable menu with sections of options.
 * @param {string} toNumber
 * @param {Array<{id: string, title: string, description?: string}>} rows - max 10 total
 * @param {string} [bodyText]
 */
async function sendListMessage(toNumber, rows, bodyText = 'Select a report to receive') {
  const phoneNumberId = process.env.PHONE_NUMBER_ID;
  const accessToken = process.env.ACCESS_TOKEN;

  // WhatsApp limits: row title <= 24 chars, description <= 72 chars, max 10 rows total
  const safeRows = rows.slice(0, 10).map(r => ({
    id: r.id,
    title: r.title.slice(0, 24),
    description: r.description ? r.description.slice(0, 72) : undefined
  }));

  console.log('[whatsapp] Sending list message...', { toNumber, rowCount: safeRows.length });

  let response;
  try {
    response = await axios.post(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to: toNumber,
        type: 'interactive',
        interactive: {
          type: 'list',
          header: { type: 'text', text: '📊 Reports' },
          body: { text: bodyText },
          footer: { text: 'Tap to select' },
          action: {
            button: 'View Reports',
            sections: [{ title: 'Available options', rows: safeRows }]
          }
        }
      },
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    const details = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    throw new Error(`Send list message failed: ${details}`);
  }

  console.log('[whatsapp] List message sent successfully.');
  return response.data;
}

module.exports = { uploadMedia, sendImageMessage, sendReportImage, sendTextMessage, sendListMessage };
