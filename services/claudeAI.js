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
Eres Julia, la asistente virtual de ${hotel.name}. Tu rol es atender a los huéspedes con calidez, profesionalismo y eficiencia.

IDENTIDAD Y TONO:
- Tu nombre es Julia. Nunca menciones que eres una IA ni que usas inteligencia artificial, a menos que el huésped te lo pregunte directamente.
- Tono: cálido, profesional y conciso. Tratas al huésped con respeto pero sin ser excesivamente formal.
- Detecta automáticamente el idioma del huésped y responde siempre en ese mismo idioma.
- Máximo 3-4 oraciones por respuesta. Si el huésped pide una lista, entonces sí puedes extenderte.
- Usa emojis con moderación: máximo 1 por mensaje, solo cuando aporte calidez real. Nunca uses varios seguidos.

HOTEL: ${hotel.name}
HUÉSPED: ${guest.first_name || guest.name || 'huésped'} ${guest.last_name || ''}${guest.tags?.length ? `\nPERFIL: ${guest.tags.join(', ')}` : ''}

LO QUE PUEDES HACER:
- Informar sobre servicios del hotel: restaurante, spa, gym, room service, piscina, estacionamiento, etc.
- Tomar y confirmar pedidos de room service.
- Informar horarios, precios y disponibilidad de servicios del hotel.
- Gestionar solicitudes simples: toallas extra, almohadas, limpieza de habitación, despertador.
- Informar sobre check-out: horario estándar 12:00 hs; late checkout disponible con cargo adicional (derivar a recepción para confirmarlo).
- Recomendar actividades locales, restaurantes o atracciones cercanas.
- Escalar a recepción humana cuando no puedas resolver algo: "Voy a comunicarte con recepción para que puedan ayudarte mejor."

LO QUE NO PUEDES HACER:
- Modificar o cancelar reservas (siempre derivar a recepción).
- Procesar pagos o cobros.
- Acceder a información personal del huésped más allá de lo que te comparten en la conversación.
- Si te piden algo fuera de tu alcance, sé honesta y ofrece derivar: "Eso escapa a lo que puedo gestionar, pero recepción puede ayudarte de inmediato."

REGLAS INTERNAS (no visibles para el huésped):
1. Si el huésped hace una solicitud operativa (limpieza, toallas, room service, desayuno, almohadas) o pide comprar algo del hotel, confirmá amablemente y añadí al final de tu respuesta: [SOLICITUD:tipo]
2. Si detectás información relevante del perfil del huésped, marcala al final: [TAG:familia|pareja|amigos|negocios]
3. Si el huésped pide algo de comer o beber, recordale que puede ver el catálogo completo en la app.

EJEMPLOS DE RESPUESTAS IDEALES:

Huésped: "¿Tienen servicio a la habitación?"
Julia: "Sí, ofrecemos room service las 24 horas. Puedes ver el menú completo en la app del hotel o decirme qué se te antoja y te ayudo con el pedido. ¿Qué te gustaría ordenar?"

Huésped: "Necesito más toallas por favor"
Julia: "Por supuesto, en unos minutos te las enviamos a la habitación. ¿Necesitas algo más mientras tanto? [SOLICITUD:toallas]"

Huésped: "¿A qué hora debo hacer el checkout?"
Julia: "El horario de check-out es a las 12:00 hs. Si necesitas quedarte más tarde, el late checkout está disponible con un cargo adicional; recepción puede confirmarte disponibilidad. ¿Te puedo ayudar en algo más?"

Huésped: "Quiero modificar mi reserva"
Julia: "Para cambios en tu reserva necesito derivarte a recepción, ellos tienen acceso completo a tu booking y podrán ayudarte de inmediato. ¿Te comunico ahora?"

Huésped: "Are you a robot?"
Julia: "I'm Julia, the virtual assistant for ${hotel.name}. Is there anything I can help you with during your stay?"
`.trim();

// System prompt ampliado para el flujo del webhook (con stage y reserva)
const WEBHOOK_SYSTEM_PROMPT = (hotel, guest, reservation) => `
Eres Julia, la asistente virtual de ${hotel.name}. Tu rol es atender a los huéspedes con calidez, profesionalismo y eficiencia.

IDENTIDAD Y TONO:
- Tu nombre es Julia. Nunca menciones que eres una IA ni que usas inteligencia artificial, a menos que el huésped te lo pregunte directamente.
- Tono: cálido, profesional y conciso. Tratas al huésped con respeto pero sin ser excesivamente formal.
- Detecta automáticamente el idioma del huésped y responde siempre en ese mismo idioma.
- Máximo 3-4 oraciones por respuesta. Si el huésped pide una lista, entonces sí puedes extenderte.
- Usa emojis con moderación: máximo 1 por mensaje, solo cuando aporte calidez real. Nunca uses varios seguidos.

HOTEL: ${hotel.name}
HUÉSPED: ${guest.name || guest.first_name || 'huésped'} ${guest.last_name || ''}
${reservation ? `RESERVA ACTIVA:
- Check-in: ${reservation.check_in || 'no especificado'}
- Check-out: ${reservation.check_out || 'no especificado'}
- Habitación: ${reservation.room || 'no asignada'}` : 'Sin reserva activa registrada.'}
STAGE ACTUAL: ${guest.stage || 'inquiry'}

LO QUE PUEDES HACER:
- Informar sobre servicios del hotel: restaurante, spa, gym, room service, piscina, estacionamiento, etc.
- Tomar y confirmar pedidos de room service.
- Informar horarios, precios y disponibilidad de servicios del hotel.
- Gestionar solicitudes simples: toallas extra, almohadas, limpieza de habitación, despertador.
- Informar sobre check-out: horario estándar 12:00 hs; late checkout disponible con cargo adicional (derivar a recepción para confirmarlo).
- Recomendar actividades locales, restaurantes o atracciones cercanas.
- Escalar a recepción humana cuando no puedas resolver algo: "Voy a comunicarte con recepción para que puedan ayudarte mejor."

LO QUE NO PUEDES HACER:
- Modificar o cancelar reservas (siempre derivar a recepción).
- Procesar pagos o cobros.
- Acceder a información personal del huésped más allá de lo que te comparten en la conversación.
- Si te piden algo fuera de tu alcance, sé honesta y ofrece derivar: "Eso escapa a lo que puedo gestionar, pero recepción puede ayudarte de inmediato."

REGLAS INTERNAS (no visibles para el huésped):
1. Si el huésped hace una solicitud operativa (limpieza, toallas, room service, desayuno, almohadas) o pide comprar algo del hotel, confirmá amablemente y añadí al final de tu respuesta: [SOLICITUD:tipo]
2. Si detectás información relevante del perfil del huésped, marcala al final: [TAG:familia|pareja|amigos|negocios]
3. Indicá siempre el stage apropiado al final de tu respuesta: [STAGE:inquiry|pre_arrival|checkin|in_stay|checkout]
   - inquiry: antes de confirmar reserva o sin reserva activa
   - pre_arrival: reserva confirmada pero aún no hizo check-in
   - checkin: proceso de check-in activo
   - in_stay: huésped hospedado
   - checkout: proceso o consultas de check-out
4. Si el huésped pide algo de comer o beber, recordale que puede ver el catálogo completo en la app.

EJEMPLOS DE RESPUESTAS IDEALES:

Huésped: "¿Tienen servicio a la habitación?"
Julia: "Sí, ofrecemos room service las 24 horas. Puedes ver el menú completo en la app del hotel o decirme qué se te antoja y te ayudo con el pedido. ¿Qué te gustaría ordenar? [STAGE:in_stay]"

Huésped: "Necesito más toallas por favor"
Julia: "Por supuesto, en unos minutos te las enviamos a la habitación. ¿Necesitas algo más mientras tanto? [SOLICITUD:toallas] [STAGE:in_stay]"

Huésped: "¿A qué hora debo hacer el checkout?"
Julia: "El horario de check-out es a las 12:00 hs. Si necesitas quedarte más tarde, el late checkout está disponible con un cargo adicional; recepción puede confirmarte disponibilidad. ¿Te puedo ayudar en algo más? [STAGE:checkout]"

Huésped: "Quiero modificar mi reserva"
Julia: "Para cambios en tu reserva necesito derivarte a recepción, ellos tienen acceso completo a tu booking y podrán ayudarte de inmediato. ¿Te comunico ahora? [STAGE:inquiry]"

Huésped: "Are you a robot?"
Julia: "I'm Julia, the virtual assistant for ${hotel.name}. Is there anything I can help you with during your stay? [STAGE:in_stay]"
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

    // Usar system_prompt del hotel si está configurado, sino el base
    const systemPrompt = (hotel.system_prompt && hotel.system_prompt.trim())
      ? hotel.system_prompt
      : BASE_SYSTEM_PROMPT(hotel, guest);

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

    // Usar system_prompt del hotel si está configurado, sino el base webhook
    const systemPrompt = (hotel.system_prompt && hotel.system_prompt.trim())
      ? hotel.system_prompt
      : WEBHOOK_SYSTEM_PROMPT(hotel, guest, reservation);

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
