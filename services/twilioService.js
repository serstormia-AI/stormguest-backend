const twilio = require('twilio');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken  = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';

function getClient() {
  if (!accountSid || !authToken) return null;
  return twilio(accountSid, authToken);
}

async function sendWhatsAppMessage(toPhone, text) {
  const client = getClient();
  if (!client) {
    console.warn('[twilio] Credenciales no configuradas');
    return { sent: false, reason: 'not_configured' };
  }
  const to = toPhone.startsWith('whatsapp:') ? toPhone : `whatsapp:${toPhone}`;
  try {
    const msg = await client.messages.create({ from: fromNumber, to, body: text });
    return { sent: true, sid: msg.sid };
  } catch (err) {
    console.error('[twilio] Error enviando mensaje:', err.message);
    return { sent: false, reason: err.message };
  }
}

module.exports = { sendWhatsAppMessage };
