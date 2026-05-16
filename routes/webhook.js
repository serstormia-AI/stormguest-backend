const express = require('express');
const router = express.Router();
const { supabase } = require('../services/supabaseClient');
const { generateResponse } = require('../services/claudeAI');
const { sendWhatsAppMessage } = require('../services/twilioService');

const FALLBACK = 'Gracias por tu mensaje. Un miembro de nuestro equipo te responderá pronto.';
let lastActivity = null;

// GET /api/webhook/status
router.get('/status', (req, res) => {
  res.json({ active: true, provider: 'twilio', lastActivity });
});

// POST /api/webhook/twilio — recibe mensajes entrantes de WhatsApp via Twilio
router.post('/twilio', async (req, res) => {
  res.status(200).send(''); // Twilio requiere 200 inmediato

  try {
    const from = req.body?.From; // "whatsapp:+5491144198009"
    const body = req.body?.Body;

    if (!from || !body) return;

    const phone = from.replace('whatsapp:', '');
    lastActivity = new Date().toISOString();
    console.log(`[twilio] Mensaje de ${phone}: "${body}"`);

    await processIncoming(phone, body);
  } catch (err) {
    console.error('[twilio] Error inesperado:', err);
  }
});

async function processIncoming(phone, messageText) {
  const guest = await getOrCreateGuest(phone);
  const conversation = await getOrCreateConversation(guest);

  await supabase.from('messages').insert({
    conversation_id: conversation.id,
    sender: 'guest',
    content: messageText
  });

  let botReply = FALLBACK;
  try {
    const hotel = { name: 'el hotel', id: guest.hotel_id };
    const result = await generateResponse(conversation.id, messageText, hotel, guest, null);
    botReply = typeof result === 'string' ? result : (result?.text || FALLBACK);
  } catch (err) {
    console.error('[twilio] Claude falló, usando fallback:', err.message);
  }

  await supabase.from('messages').insert({
    conversation_id: conversation.id,
    sender: 'bot',
    content: botReply
  });

  const sent = await sendWhatsAppMessage(`whatsapp:${phone}`, botReply);
  if (!sent.sent) console.error('[twilio] Fallo al enviar:', sent.reason);
  else console.log(`[twilio] Respuesta enviada a ${phone}`);
}

async function getOrCreateGuest(phone) {
  const { data: existing } = await supabase
    .from('guests').select('*').eq('phone', phone).limit(1);

  if (existing?.length > 0) return existing[0];

  const { data: created } = await supabase
    .from('guests')
    .insert({ phone, name: `Huésped ${phone.slice(-4)}`, hotel_id: null })
    .select().single();

  return created || { id: null, phone, name: `Huésped ${phone.slice(-4)}`, hotel_id: null };
}

async function getOrCreateConversation(guest) {
  if (guest.id) {
    const { data: existing } = await supabase
      .from('conversations').select('*')
      .eq('guest_id', guest.id).eq('status', 'open').limit(1);

    if (existing?.length > 0) return existing[0];
  }

  const { data: created } = await supabase
    .from('conversations')
    .insert({ hotel_id: guest.hotel_id, guest_id: guest.id, channel: 'whatsapp', status: 'open' })
    .select().single();

  return created || { id: null };
}

module.exports = router;
