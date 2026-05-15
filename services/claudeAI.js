/**
 * Claude AI Service (Bot Brain)
 * Maneja contexto, stage del huésped y detección de intenciones para StormGuest
 * Usa @anthropic-ai/sdk (claude-haiku-4-5-20251001)
 */

const Anthropic = require('@anthropic-ai/sdk').default || require('@anthropic-ai/sdk');
const { supabase } = require('./supabaseClient');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// System prompt base para el contexto hotelero
const BASE_SYSTEM_PROMPT = (hotel, guest) => `
Sos Julia, la asistente virtual de ${hotel.name}. Sos amable, profesional y eficiente.
Respondés siempre en el idioma del huésped (detectalo automáticamente).
Nunca revelés que sos una IA a menos que te lo pregunten directamente.
Mantené conversaciones cortas y directas. Máximo 3-4 líneas por respuesta.
Usá emojis con moderación para dar calidez.

HOTEL: ${hotel.name}

HUÉSPED ACTUAL:
- Nombre: ${guest.first_name || guest.name || 'huésped'} ${guest.last_name || ''}
- Etiquetas: ${guest.tags?.join(', ') || 'sin clasificar'}

REGLAS DE NEGOCIO:
1. Si el huésped hace una solicitud operativa (limpieza, toallas, room service, desayuno) o pide comprar algo del hotel, confirmá amablemente y clasificalo internamente al final de tu respuesta como: [SOLICITUD:tipo]
2. Ejemplo: "Claro, enseguida envío toallas a tu habitación. [SOLICITUD:toallas]"
3. Si detectás información importante del viaje del huésped, marcala: [TAG:familia|pareja|amigos|negocios]
4. Sé proactiva: si pide algo de comer, recordale que puede ver el catálogo en la app.
`.trim();

// System prompt ampliado para el flujo del webhook (con stage y reserva)
const WEBHOOK_SYSTEM_PROMPT = (hotel, guest, reservation) => `
Sos Julia, la asistente virtual de ${hotel.name}. Sos amable, profesional y eficiente.
Respondés siempre en el idioma del huésped (detectalo automáticamente).
Nunca revelés que sos una IA a menos que te lo pregunten directamente.
Mantené conversaciones cortas y directas. Máximo 3-4 líneas por respuesta.
Usá emojis con moderación para dar calidez.

HOTEL: ${hotel.name}

HUÉSPED ACTUAL:
- Nombre: ${guest.name || guest.first_name || 'huésped'} ${guest.last_name || ''}
- Teléfono: ${guest.phone || 'desconocido'}

${reservation ? `RESERVA ACTIVA:
- Check-in: ${reservation.check_in || 'no especificado'}
- Check-out: ${reservation.check_out || 'no especificado'}
- Habitación: ${reservation.room || 'no asignada'}
` : 'Sin reserva activa registrada.'}

REGLAS DE NEGOCIO:
1. Si el huésped hace una solicitud operativa (limpieza, toallas, room service, desayuno) o pide comprar algo del hotel, confirmá amablemente y clasificalo internamente al final de tu respuesta como: [SOLICITUD:tipo]
2. Ejemplo: "Claro, enseguida envío toallas a tu habitación. [SOLICITUD:toallas]"
3. Si detectás información importante del viaje del huésped, marcala: [TAG:familia|pareja|amigos|negocios]
4. Sé proactiva: si pide algo de comer, recordale que puede ver el catálogo en la app.
5. Respondé el STAGE actual de la conversación al final como: [STAGE:inquiry|pre_arrival|checkin|in_stay|checkout]

STAGE ACTUAL: ${guest.stage || 'inquiry'}
`.trim();

/**
 * Genera respuesta de Claude para el flujo chatBot.js (Supabase Realtime).
 * Firma: generateResponse(hotel, guest, newMessage, messagesHistory)
 *
 * También soporta la firma del webhook:
 * generateResponse(conversationId, messageContent, hotel, guest, reservation)
 *
 * La distinción se hace por el tipo del primer argumento.
 */
async function generateResponse(hotelOrConvId, guestOrContent, newMessageOrHotel, messagesHistoryOrGuest, reservationOrUndefined) {
  // Detectar qué firma se está usando
  // Firma A (chatBot.js): hotel{object}, guest{object}, newMessage{string}, messagesHistory{array}
  // Firma B (webhook.js): conversationId{string|number}, messageContent{string}, hotel{object}, guest{object}, reservation{object|null}
  const isWebhookSignature = (typeof hotelOrConvId === 'string' || typeof hotelOrConvId === 'number') && typeof guestOrContent === 'string';

  if (isWebhookSignature) {
    return await generateResponseWebhook(
      hotelOrConvId,       // conversationId
      guestOrContent,      // messageContent
      newMessageOrHotel,   // hotel
      messagesHistoryOrGuest, // guest
      reservationOrUndefined  // reservation
    );
  } else {
    return await generateResponseChatBot(
      hotelOrConvId,          // hotel
      guestOrContent,         // guest
      newMessageOrHotel,      // newMessage
      messagesHistoryOrGuest  // messagesHistory
    );
  }
}

/**
 * Flujo ChatBot (Supabase Realtime) - retorna string limpio
 */
async function generateResponseChatBot(hotel, guest, newMessage, messagesHistory) {
  try {
    // Preparar historial en formato Anthropic
    const messages = (messagesHistory || []).map(m => ({
      role: m.sender_type === 'guest' ? 'user' : 'assistant',
      content: m.content,
    }));

    // Agregar el mensaje nuevo del huésped
    messages.push({ role: 'user', content: newMessage });

    const systemPrompt = BASE_SYSTEM_PROMPT(hotel, guest);

    // Llamar a Claude con prompt caching en el system prompt
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: [
        {
          type: 'text',
          text: systemPrompt,
          cache_control: { type: 'ephemeral' },
        }
      ],
      messages,
    });

    const responseText = response.content[0].text;

    // Procesar comandos internos (Solicitudes y Tags)
    await processInternalCommands(responseText, hotel, guest);

    // Limpiar el texto de comandos antes de enviarlo al huésped
    const cleanResponse = responseText
      .replace(/\[SOLICITUD:[^\]]+\]/g, '')
      .replace(/\[TAG:[^\]]+\]/g, '')
      .replace(/\[STAGE:[^\]]+\]/g, '')
      .trim();

    return cleanResponse;

  } catch (error) {
    console.error('❌ Error en Claude AI Service (chatBot):', error);
    throw error;
  }
}

/**
 * Flujo Webhook (WhatsApp via Evolution) - retorna { text, stage }
 * Recupera el historial de la conversación desde pool (PostgreSQL)
 */
async function generateResponseWebhook(conversationId, messageContent, hotel, guest, reservation) {
  try {
    // Importar pool aquí para evitar dependencia circular si no está disponible
    let history = [];
    try {
      const { pool } = require('../database');
      const { rows } = await pool.query(
        `SELECT role, content FROM messages
         WHERE conversation_id = $1
         ORDER BY created_at ASC
         LIMIT 20`,
        [conversationId]
      );
      history = rows;
    } catch (dbErr) {
      console.warn('⚠️ No se pudo obtener historial del webhook:', dbErr.message);
    }

    // Construir mensajes en formato Anthropic
    const messages = history.map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content,
    }));

    // Agregar el mensaje actual
    messages.push({ role: 'user', content: messageContent });

    const systemPrompt = WEBHOOK_SYSTEM_PROMPT(hotel, guest, reservation);

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: [
        {
          type: 'text',
          text: systemPrompt,
          cache_control: { type: 'ephemeral' },
        }
      ],
      messages,
    });

    const responseText = response.content[0].text;

    // Extraer stage si Claude lo incluyó
    const stageMatch = responseText.match(/\[STAGE:([^\]]+)\]/);
    const stage = stageMatch ? stageMatch[1].trim() : (guest.stage || 'inquiry');

    // Limpiar el texto de comandos
    const cleanText = responseText
      .replace(/\[SOLICITUD:[^\]]+\]/g, '')
      .replace(/\[TAG:[^\]]+\]/g, '')
      .replace(/\[STAGE:[^\]]+\]/g, '')
      .trim();

    return { text: cleanText, stage };

  } catch (error) {
    console.error('❌ Error en Claude AI Service (webhook):', error);
    throw error;
  }
}

/**
 * Procesa los comandos ocultos que la IA pone en su respuesta
 */
async function processInternalCommands(text, hotel, guest) {
  // 1. Detectar solicitudes (Pedidos)
  const solicitudMatch = text.match(/\[SOLICITUD:([^\]]+)\]/);
  if (solicitudMatch) {
    const tipo = solicitudMatch[1].trim();

    // Buscar si existe una experiencia/producto similar
    const { data: exps } = await supabase
      .from('experiences')
      .select('id, price')
      .eq('hotel_id', hotel.id)
      .ilike('title', `%${tipo}%`)
      .limit(1);

    let experience_id = null;
    let total_price = 0;

    if (exps && exps.length > 0) {
      experience_id = exps[0].id;
      total_price = exps[0].price;
    }

    // Insertar el pedido en tiempo real
    await supabase.from('requests').insert({
      hotel_id: hotel.id,
      guest_id: guest.id,
      experience_id: experience_id,
      total_price: total_price,
      status: 'pending',
      internal_note: `Pedido automático vía ChatBot: ${tipo}`,
    });

    console.log(`📋 [BOT] Pedido automático creado: ${tipo}`);
  }

  // 2. Detectar y actualizar Tags del huésped
  const tagMatch = text.match(/\[TAG:([^\]]+)\]/);
  if (tagMatch) {
    const newTag = tagMatch[1];
    const tags = Array.isArray(guest.tags) ? [...guest.tags] : [];

    if (!tags.includes(newTag)) {
      tags.push(newTag);
      await supabase
        .from('guests')
        .update({ tags })
        .eq('id', guest.id);
      console.log(`🏷️ [BOT] Etiqueta añadida al huésped: ${newTag}`);
    }
  }
}

/**
 * TODO: Transcripción de audio
 *
 * Anthropic no ofrece API de transcripción de audio.
 * Para transcribir audios de WhatsApp se recomienda usar OpenAI Whisper:
 *
 *   const OpenAI = require('openai');
 *   const openaiWhisper = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
 *   const transcription = await openaiWhisper.audio.transcriptions.create({
 *     file: audioBuffer,
 *     model: 'whisper-1',
 *   });
 *   return transcription.text;
 *
 * Por ahora retorna un mensaje de error amigable para no romper el flujo.
 */
async function transcribeAudio(audioBuffer) {
  console.warn('⚠️ transcribeAudio: Anthropic no tiene API de transcripción. Implementar con OpenAI Whisper.');
  return '[Audio recibido — transcripción no disponible]';
}

module.exports = { generateResponse, transcribeAudio };
