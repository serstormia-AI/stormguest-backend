/**
 * Webhook Route
 * Punto de entrada de todos los mensajes de WhatsApp
 * Orquesta: recibir → procesar → IA → responder
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const { generateResponse } = require('../services/claudeAI');
const { sendMessage, parseIncomingMessage, verifyWebhook, downloadMedia } = require('../services/whatsapp');
const { transcribeAudio } = require('../services/claudeAI');

// ============================================================
// GET - Verificación del webhook (Meta)
// ============================================================
router.get('/', verifyWebhook);

// ============================================================
// POST - Recibir mensajes entrantes
// ============================================================
router.post('/', async (req, res) => {
  // Responder 200 inmediatamente (WhatsApp requiere respuesta rápida)
  res.status(200).send('OK');
  
  try {
    const parsed = parseIncomingMessage(req.body);
    if (!parsed) return;
    
    console.log(`📩 Mensaje de ${parsed.from}: "${parsed.content}"`);
    
    await processIncomingMessage(parsed);
  } catch (error) {
    console.error('❌ Error procesando mensaje:', error);
  }
});

// ============================================================
// FUNCIÓN PRINCIPAL DE PROCESAMIENTO
// ============================================================

async function processIncomingMessage(parsed) {
  const { from, to, name, content, mediaUrl, mediaType, messageId } = parsed;

  // 1. Verificar si ya procesamos este mensaje (deduplicación)
  const { rows: existing } = await pool.query(
    `SELECT id FROM messages WHERE whatsapp_message_id = $1`,
    [messageId]
  );
  if (existing.length > 0) {
    console.log(`⚠️ Mensaje duplicado ${messageId}, ignorando`);
    return;
  }

  // 2. Encontrar el hotel por instancia Evolution (el 'to' es el instance name desde Evolution)
  const { rows: hotels } = await pool.query(
    `SELECT * FROM hotels WHERE settings->>'evolution_instance' = $1 AND active = true`,
    [to]
  );

  if (!hotels.length) {
    console.error(`❌ No se encontró hotel para instancia ${to}`);
    return;
  }

  const hotel = hotels[0];

  // 3. Obtener o crear huésped
  const guest = await getOrCreateGuest(hotel.id, from, name);

  // 4. Obtener reserva activa del huésped
  const reservation = await getActiveReservation(hotel.id, guest.id);

  // 5. Obtener o crear conversación activa
  const conversation = await getOrCreateConversation(hotel.id, guest.id, reservation?.id);

  // 6. Procesar audio si es necesario
  let messageContent = content;
  if (mediaType === 'audio' && mediaUrl) {
    console.log('🎤 Procesando audio...');
    const audioBuffer = await downloadMedia(mediaUrl, hotel.whatsapp_token);
    if (audioBuffer) {
      messageContent = await transcribeAudio(audioBuffer);
      console.log(`🎤 Transcripción: "${messageContent}"`);
    }
  }

  // 7. Guardar mensaje del huésped
  await pool.query(
    `INSERT INTO messages (conversation_id, role, content, whatsapp_message_id)
     VALUES ($1, 'user', $2, $3)`,
    [conversation.id, messageContent, messageId]
  );

  // 8. Actualizar nombre del huésped si es necesario
  if (name) {
    await pool.query(
      `UPDATE guests SET name = $1 WHERE id = $2`,
      [name, guest.id]
    );
  }

  // 9. Generar respuesta con Claude
  const aiResponse = await generateResponse(
    conversation.id,
    messageContent,
    hotel,
    guest,
    reservation
  );

  // 10. Guardar respuesta de la IA
  await pool.query(
    `INSERT INTO messages (conversation_id, role, content)
     VALUES ($1, 'assistant', $2, $3)`,
    [conversation.id, aiResponse.text, aiResponse.tokensUsed]
  );

  // 11. Actualizar stage de la conversación
  await pool.query(
    `UPDATE conversations SET stage = $1 WHERE id = $2`,
    [aiResponse.stage, conversation.id]
  );

  // 12. Enviar respuesta por WhatsApp
  await sendMessage(from, aiResponse.text, hotel.whatsapp_token);
  
  console.log(`✅ Respuesta enviada a ${from} (stage: ${aiResponse.stage})`);
}

// ============================================================
// HELPERS
// ============================================================

async function getOrCreateGuest(hotelId, phone, name) {
  // Intentar obtener existente
  const { rows } = await pool.query(
    `SELECT * FROM guests WHERE hotel_id = $1 AND phone = $2`,
    [hotelId, phone]
  );
  
  if (rows.length > 0) return rows[0];
  
  // Crear nuevo
  const { rows: created } = await pool.query(
    `INSERT INTO guests (hotel_id, phone, name)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [hotelId, phone, name || null]
  );
  
  console.log(`👤 Nuevo huésped creado: ${phone}`);
  return created[0];
}

async function getActiveReservation(hotelId, guestId) {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM reservations
       WHERE hotel_id = $1 AND guest_id = $2
       LIMIT 1`,
      [hotelId, guestId]
    );
    return rows[0] || null;
  } catch (err) {
    // Si la tabla no existe o schema no coincide, continuar sin reserva
    console.warn('⚠️ No se pudo buscar reserva:', err.message);
    return null;
  }
}

async function getOrCreateConversation(hotelId, guestId, reservationId) {
  try {
    // Buscar conversación existente
    const { rows } = await pool.query(
      `SELECT * FROM conversations
       WHERE hotel_id = $1 AND guest_id = $2
       LIMIT 1`,
      [hotelId, guestId]
    );

    if (rows.length > 0) return rows[0];
  } catch (err) {
    console.warn('⚠️ Error buscando conversación:', err.message);
  }

  // Crear nueva conversación
  try {
    const { rows: created } = await pool.query(
      `INSERT INTO conversations (hotel_id, guest_id, stage)
       VALUES ($1, $2, 'inquiry')
       RETURNING *`,
      [hotelId, guestId]
    );
    return created[0];
  } catch (err) {
    console.warn('⚠️ Error creando conversación:', err.message);
    return { id: `conv_${Date.now()}`, hotel_id: hotelId, guest_id: guestId };
  }
}

module.exports = router;
