/**
 * Claude AI Service
 * El cerebro conversacional de SmartGuest AI
 * Maneja contexto, stage del huésped, upselling inteligente
 */

const Anthropic = require('@anthropic-ai/sdk');
const { pool } = require('../database');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ============================================================
// SYSTEM PROMPTS POR STAGE
// ============================================================

const BASE_SYSTEM_PROMPT = (hotel, guest, reservation, stage) => `
Sos Julia, la asistente virtual del ${hotel.name}. Sos amable, profesional y eficiente.
Respondés siempre en el idioma del huésped (detectalo automáticamente).
Nunca revelés que sos una IA a menos que te lo pregunten directamente.
Mantené conversaciones cortas y directas. Máximo 3-4 líneas por respuesta.
Usá emojis con moderación para dar calidez.

HOTEL: ${hotel.name}
TIMEZONE: ${hotel.timezone}
MONEDA: ${hotel.currency}
CONFIGURACIÓN: ${JSON.stringify(hotel.settings)}

HUÉSPED ACTUAL:
- Nombre: ${guest.name || 'huésped'}
- Idioma detectado: ${guest.language}
- Etiquetas: ${guest.tags?.join(', ') || 'sin clasificar'}
- Estadías previas: ${guest.total_stays || 0}
- Memoria: ${JSON.stringify(guest.memory || {})}

${reservation ? `
RESERVA ACTIVA:
- Check-in: ${reservation.check_in}
- Check-out: ${reservation.check_out}
- Habitación: ${reservation.room_type} ${reservation.room_number ? `#${reservation.room_number}` : ''}
- Huéspedes: ${reservation.adults} adultos, ${reservation.children} niños
- Estado: ${reservation.status}
` : 'Sin reserva activa en este momento.'}

STAGE ACTUAL: ${stage}
${getStageInstructions(stage, hotel)}

REGLAS DE NEGOCIO:
1. Si el huésped hace una solicitud operativa (limpieza, taxi, room service), confirmá que lo tomaste y clasificalo internamente como: [SOLICITUD:tipo]
2. Si detectás una oportunidad de upselling según el contexto, ofrecé UN servicio a la vez, de forma natural.
3. Si el huésped parece molesto o tiene una queja, priorizá la empatía y escalá al equipo: [ESCALAR:motivo]
4. Al final de cada conversación donde detectes el tipo de viaje, clasificá: [TAG:familia|pareja|amigos|negocios|esquiador|turismo|evento_deportivo|evento_musical]
5. Si detectás información memorable del huésped, marcala: [MEMORIA:clave=valor]
`;

function getStageInstructions(stage, hotel) {
  const instructions = {
    inquiry: `
MODO CONSULTA PRE-RESERVA:
- Tu objetivo es cerrar la reserva o derivar al sitio web.
- Respondé preguntas sobre disponibilidad, precios, servicios.
- Al final de la consulta, ofrecé un link de reserva o pedí datos para reservar por WhatsApp.
- Detectá el motivo del viaje para etiquetar al huésped.
    `,
    pre_stay: `
MODO PRE-ESTADÍA (Día anterior al check-in):
- Dale la bienvenida anticipada con entusiasmo.
- Ofrecé: traslado al hotel ($${hotel.settings?.transfer_price || 15}), early check-in ($${hotel.settings?.early_checkin_price || 20}), reserva en restaurante ($${hotel.settings?.restaurant_price || 60}).
- Recordale el horario de check-in: ${hotel.settings?.check_in_time || '15:00'}.
- Preguntá si necesitan algo especial para su llegada.
    `,
    during_stay: `
MODO ESTADÍA ACTIVA:
- Sos el concierge virtual 24/7.
- Respondé consultas del hotel y la ciudad.
- Tomá solicitudes (limpieza, mantenimiento, room service, taxi).
- Ofrecé servicios del hotel de forma contextual y natural.
- Si pregunta por restaurantes/actividades fuera, recomendá partners del hotel.
- Cada mañana, si es el primer mensaje del día, mencioná una actividad del hotel.
    `,
    checkout: `
MODO CHECKOUT (Día del check-out):
- Preguntá si necesitan late check-out ($${hotel.settings?.late_checkout_price || 20}) o traslado al aeropuerto ($${hotel.settings?.transfer_price || 15}).
- Agradecé la estadía con calidez genuina.
- Despedite y plantá la semilla para la próxima visita.
    `,
    post_stay: `
MODO POST-ESTADÍA:
- 24hs después del check-out: preguntá brevemente cómo fue la experiencia.
- Si la respuesta es positiva (6+/10 o expresión positiva): pedí una reseña en Google. Marcá: [RESEÑA:positiva]
- Si es negativa: pedí disculpas, buscá entender qué pasó. Marcá: [RESEÑA:negativa]
- No seas insistente. Una sola pregunta de feedback.
    `,
    remarketing: `
MODO REMARKETING:
- Estás re-contactando a un ex-huésped.
- Tenés una oferta especial o recordatorio de temporada.
- Sé breve, personal y con propuesta de valor clara.
- No presiones. Si no responden o dicen que no, agradecer y cerrar.
    `,
  };
  
  return instructions[stage] || instructions.inquiry;
}

// ============================================================
// FUNCIÓN PRINCIPAL: Generar respuesta de Claude
// ============================================================

async function generateResponse(conversationId, newMessage, hotel, guest, reservation) {
  // 1. Obtener historial de mensajes (últimos 20 para no gastar tokens)
  const { rows: history } = await pool.query(
    `SELECT role, content FROM messages 
     WHERE conversation_id = $1 
     ORDER BY created_at DESC 
     LIMIT 20`,
    [conversationId]
  );
  
  const messages = history.reverse().map(m => ({
    role: m.role,
    content: m.content,
  }));
  
  // Agregar el mensaje nuevo
  messages.push({ role: 'user', content: newMessage });

  // 2. Determinar el stage actual
  const stage = await detectStage(guest, reservation);

  // 3. Llamar a Claude
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 500,
    system: BASE_SYSTEM_PROMPT(hotel, guest, reservation, stage),
    messages,
  });

  const responseText = response.content[0].text;
  const tokensUsed = response.usage.input_tokens + response.usage.output_tokens;

  // 4. Procesar comandos internos de la IA
  await processInternalCommands(responseText, guest, conversationId, reservation);

  // 5. Limpiar el texto antes de enviarlo al huésped
  const cleanResponse = responseText
    .replace(/\[SOLICITUD:[^\]]+\]/g, '')
    .replace(/\[ESCALAR:[^\]]+\]/g, '')
    .replace(/\[TAG:[^\]]+\]/g, '')
    .replace(/\[MEMORIA:[^\]]+\]/g, '')
    .replace(/\[RESEÑA:[^\]]+\]/g, '')
    .trim();

  return {
    text: cleanResponse,
    tokensUsed,
    stage,
    rawResponse: responseText,
  };
}

// ============================================================
// DETECTAR STAGE DEL HUÉSPED
// ============================================================

async function detectStage(guest, reservation) {
  if (!reservation) return 'inquiry';
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const checkIn = new Date(reservation.check_in);
  const checkOut = new Date(reservation.check_out);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  const daysBefore = Math.floor((checkIn - today) / (1000 * 60 * 60 * 24));
  const daysAfter = Math.floor((today - checkOut) / (1000 * 60 * 60 * 24));

  if (reservation.status === 'checked_in') return 'during_stay';
  if (daysBefore === 1) return 'pre_stay';
  if (daysBefore <= 0 && reservation.status === 'confirmed') return 'during_stay';
  if (reservation.status === 'checked_out' && daysAfter === 0) return 'checkout';
  if (reservation.status === 'checked_out' && daysAfter >= 1 && daysAfter <= 3) return 'post_stay';
  
  return 'inquiry';
}

// ============================================================
// PROCESAR COMANDOS INTERNOS DE LA IA
// ============================================================

async function processInternalCommands(text, guest, conversationId, reservation) {
  // Detectar solicitudes
  const solicitudMatch = text.match(/\[SOLICITUD:([^\]]+)\]/);
  if (solicitudMatch) {
    const tipo = solicitudMatch[1];
    await pool.query(
      `UPDATE conversations SET column_name = $1, status = 'in_progress' WHERE id = $2`,
      [tipo.charAt(0).toUpperCase() + tipo.slice(1), conversationId]
    );
    // Aquí podrías disparar una notificación al staff
    console.log(`📋 Solicitud detectada: ${tipo} para huésped ${guest.id}`);
  }

  // Detectar necesidad de escalar
  const escalarMatch = text.match(/\[ESCALAR:([^\]]+)\]/);
  if (escalarMatch) {
    await pool.query(
      `UPDATE conversations SET status = 'escalated', column_name = 'Quejas' WHERE id = $1`,
      [conversationId]
    );
    console.log(`🚨 ESCALAR: ${escalarMatch[1]}`);
  }

  // Actualizar tags del huésped
  const tagMatch = text.match(/\[TAG:([^\]]+)\]/);
  if (tagMatch) {
    const newTag = tagMatch[1];
    await pool.query(
      `UPDATE guests SET tags = array_append(
        array_remove(tags, $1), $1
      ) WHERE id = $2`,
      [newTag, guest.id]
    );
  }

  // Guardar en memoria del huésped
  const memoriaMatches = [...text.matchAll(/\[MEMORIA:([^=]+)=([^\]]+)\]/g)];
  if (memoriaMatches.length > 0) {
    const memoryUpdates = {};
    memoriaMatches.forEach(m => {
      memoryUpdates[m[1].trim()] = m[2].trim();
    });
    await pool.query(
      `UPDATE guests SET memory = memory || $1::jsonb WHERE id = $2`,
      [JSON.stringify(memoryUpdates), guest.id]
    );
  }

  // Gestión de reseñas
  const resenaMatch = text.match(/\[RESEÑA:([^\]]+)\]/);
  if (resenaMatch && reservation) {
    const sentiment = resenaMatch[1];
    await pool.query(
      `INSERT INTO reviews (hotel_id, guest_id, reservation_id, sentiment, google_review_requested)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING`,
      [guest.hotel_id, guest.id, reservation.id, sentiment, sentiment === 'positiva']
    );
  }
}

// ============================================================
// TRANSCRIBIR AUDIO (Whisper)
// ============================================================

async function transcribeAudio(audioBuffer, mimeType = 'audio/ogg') {
  try {
    // Whisper via OpenAI API
    const OpenAI = require('openai');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    
    const transcription = await openai.audio.transcriptions.create({
      file: audioBuffer,
      model: 'whisper-1',
    });
    
    return transcription.text;
  } catch (error) {
    console.error('Error transcribiendo audio:', error);
    return '[No pude transcribir el audio, ¿podés escribirlo?]';
  }
}

module.exports = { generateResponse, detectStage, transcribeAudio };
