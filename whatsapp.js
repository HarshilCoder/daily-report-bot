// whatsapp.js
// Uploads a local image to WhatsApp Cloud API and sends it as a message.

const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
require('dotenv').config();

const GRAPH_API_VERSION = 'v21.0'; // update if Meta deprecates this version

/**
 * Uploads a local image file to WhatsApp Cloud API's media endpoint.
 * @param {string} imagePath - Local path to the PNG file.
 * @returns {Promise<string>} media_id to reference in the send step.
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
  form.append('file', fs.createReadStream(imagePath), {
    contentType: 'image/png'
  });

  let response;
  try {
    response = await axios.post(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/media`,
      form,
      {
        headers: {
          ...form.getHeaders(),
          Authorization: `Bearer ${accessToken}`
        },
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
 * @returns {Promise<object>} WhatsApp API response data.
 */
async function sendImageMessage(mediaId, caption = '') {
  const phoneNumberId = process.env.PHONE_NUMBER_ID;
  const accessToken = process.env.ACCESS_TOKEN;
  const toNumber = process.env.TO_NUMBER;

  console.log('[whatsapp] Sending image message...', { toNumber, mediaId });

  let response;
  try {
    response = await axios.post(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to: toNumber,
        type: 'image',
        image: {
          id: mediaId,
          caption
        }
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
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
 */
async function sendReportImage(imagePath, caption = '') {
  const mediaId = await uploadMedia(imagePath);
  return sendImageMessage(mediaId, caption);
}

module.exports = { uploadMedia, sendImageMessage, sendReportImage };