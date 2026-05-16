// Required env vars:
// EVOLUTION_API_KEY
// EVOLUTION_API_URL
// EVOLUTION_INSTANCE
// SUPABASE_SERVICE_ROLE_KEY
// ANTHROPIC_API_KEY

const express = require('express');
const router = express.Router();
const { supabase } = require('../services/supabaseClient');
const { generateResponse } = require('../services/claudeAI');
const { sendWhatsAppMessage } = require('../services/evolutionAPI');

const FALLBACK_MESSAGE = 'Gracias por tu mensaje. Un miembro de nuestro equipo te responderá pronto.';

let lastActivity = null;

// GET /api/webhook/status
router.get('/status', (req, res) => {
  res.json({
    active: true,
    lastActivity,
  });
});

// POST /api/webhook/evolution
router.post('/evolution', async (req, res) => {
  res.status(200).send('OK');

  try {
    const payload = req.body;
    const remoteJid = payload?.data?.key?.remoteJid;
    const messageText =
      payload?.data?.message?.conversation ||
      payload?.data?.message?.extendedTextMessage?.text;

    if (!remoteJid || !messageText) {
      console.error('webhook/evolution: payload sin remoteJid o mensaje de texto', JSON.stringify(payload));
      return;
    }

    const phone = remoteJid.replace('@s.whatsapp.net', '').replace('@c.us', '');

    lastActivity = new Date().toISOString();
    console.log(`webhook/evolution: mensaje entrante de ${phone}: "${messageText}"`);

    await processIncoming(phone, messageText);
  } catch (err) {
    console.error('webhook/evolution: error no esperado:', err);
  }
});

async function processIncoming(phone, messageText) {
  const guest = await getOrCreateGuest(phone);
  const conversation = await getOrCreateConversation(guest);

  try {
    const { error: insertGuestMsgError } = await supabase
      .from('messages')
      .insert({ conversation_id: conversation.id, sender: 'guest', content: messageText });

    if (insertGuestMsgError) {
      console.error('webhook/evolution: error guardando mensaje del guest:', insertGuestMsgError);
    }
  } catch (err) {
    console.error('webhook/evolution: excepcion guardando mensaje del guest:', err);
  }

  let botReply = FALLBACK_MESSAGE;
  try {
    const hotelContext = { name: 'el hotel', id: guest.hotel_id };
    const aiResult = await generateResponse(
      conversation.id,
      messageText,
      hotelContext,
      guest,
      null
    );
    botReply = typeof aiResult === 'string' ? aiResult : (aiResult.text || FALLBACK_MESSAGE);
  } catch (err) {
    console.error('webhook/evolution: claudeAI falló, usando fallback:', err);
  }

  try {
    const { error: insertBotMsgError } = await supabase
      .from('messages')
      .insert({ conversation_id: conversation.id, sender: 'bot', content: botReply });

    if (insertBotMsgError) {
      console.error('webhook/evolution: error guardando respuesta del bot:', insertBotMsgError);
    }
  } catch (err) {
    console.error('webhook/evolution: excepcion guardando respuesta del bot:', err);
  }

  try {
    await sendWhatsAppMessage(phone, botReply);
    console.log(`webhook/evolution: respuesta enviada a ${phone}`);
  } catch (err) {
    console.error('webhook/evolution: falló envío por Evolution API (respuesta ya guardada en DB):', err.message);
  }
}

async function getOrCreateGuest(phone) {
  try {
    const { data: existing, error } = await supabase
      .from('guests')
      .select('*')
      .eq('phone', phone)
      .limit(1);

    if (error) throw error;
    if (existing && existing.length > 0) return existing[0];
  } catch (err) {
    console.error('webhook/evolution: error buscando guest:', err);
  }

  const lastFour = phone.slice(-4);
  try {
    const { data: created, error } = await supabase
      .from('guests')
      .insert({ phone, name: `Huésped ${lastFour}`, hotel_id: null })
      .select()
      .single();

    if (error) throw error;
    console.log(`webhook/evolution: guest creado: ${phone}`);
    return created;
  } catch (err) {
    console.error('webhook/evolution: error creando guest:', err);
    return { id: null, phone, name: `Huésped ${lastFour}`, hotel_id: null };
  }
}

async function getOrCreateConversation(guest) {
  if (guest.id) {
    try {
      const { data: existing, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('guest_id', guest.id)
        .eq('status', 'open')
        .limit(1);

      if (error) throw error;
      if (existing && existing.length > 0) return existing[0];
    } catch (err) {
      console.error('webhook/evolution: error buscando conversación:', err);
    }
  }

  try {
    const { data: created, error } = await supabase
      .from('conversations')
      .insert({
        hotel_id: guest.hotel_id,
        guest_id: guest.id,
        channel: 'whatsapp',
        status: 'open',
      })
      .select()
      .single();

    if (error) throw error;
    console.log(`webhook/evolution: conversación creada para guest ${guest.id}`);
    return created;
  } catch (err) {
    console.error('webhook/evolution: error creando conversación:', err);
    return { id: null };
  }
}

module.exports = router;
