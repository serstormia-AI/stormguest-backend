/**
 * Automation Scheduler
 * Envía mensajes automáticos según el stage del huésped
 * Corre cada hora con node-cron
 */

const cron = require('node-cron');
const { pool } = require('../database');
const { sendMessage } = require('./whatsapp');
const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ============================================================
// INICIAR TODOS LOS SCHEDULERS
// ============================================================

function startSchedulers() {
  // Cada hora: revisar automaciones pendientes
  cron.schedule('0 * * * *', runHourlyAutomations);
  
  // Cada día a las 9am: mensajes de actividades del día
  cron.schedule('0 9 * * *', sendDailyActivities);
  
  // Cada día a las 8am: saludos de cumpleaños
  cron.schedule('0 8 * * *', sendBirthdayGreetings);
  
  console.log('⏰ Schedulers iniciados');
}

// ============================================================
// AUTOMACIONES POR HORA
// ============================================================

async function runHourlyAutomations() {
  console.log('⏰ Corriendo automaciones...');
  
  await Promise.allSettled([
    sendPreCheckinMessages(),
    sendWelcomeMessages(),
    sendCheckoutMessages(),
    sendPostStayReviews(),
  ]);
}

// --- PRE CHECK-IN (24hs antes) ---
async function sendPreCheckinMessages() {
  const { rows } = await pool.query(`
    SELECT r.*, g.phone, g.name, g.language, g.tags, g.memory,
           h.name as hotel_name, h.settings, h.whatsapp_token,
           h.claude_system_prompt
    FROM reservations r
    JOIN guests g ON g.id = r.guest_id
    JOIN hotels h ON h.id = r.hotel_id
    WHERE r.status = 'confirmed'
      AND r.check_in = CURRENT_DATE + INTERVAL '1 day'
      AND NOT EXISTS (
        SELECT 1 FROM messages m
        JOIN conversations c ON c.id = m.conversation_id
        WHERE c.guest_id = r.guest_id
          AND c.hotel_id = r.hotel_id
          AND m.role = 'assistant'
          AND m.created_at > NOW() - INTERVAL '20 hours'
          AND m.content LIKE '%mañana%'
      )
    LIMIT 50
  `);
  
  for (const row of rows) {
    try {
      const message = await generateAutomatedMessage('pre_checkin', row);
      await sendMessage(row.phone, message, row.whatsapp_token);
      
      // Guardar en base de datos
      const conv = await getOrCreateConvForAutomation(row);
      await saveAutomationMessage(conv.id, message);
      
      console.log(`✉️ Pre-checkin enviado a ${row.phone}`);
    } catch (e) {
      console.error(`Error pre-checkin ${row.phone}:`, e.message);
    }
  }
}

// --- BIENVENIDA (al hacer check-in) ---
async function sendWelcomeMessages() {
  const { rows } = await pool.query(`
    SELECT r.*, g.phone, g.name, g.language, g.tags, g.memory,
           h.name as hotel_name, h.settings, h.whatsapp_token
    FROM reservations r
    JOIN guests g ON g.id = r.guest_id
    JOIN hotels h ON h.id = r.hotel_id
    WHERE r.status = 'checked_in'
      AND NOT EXISTS (
        SELECT 1 FROM messages m
        JOIN conversations c ON c.id = m.conversation_id
        WHERE c.guest_id = r.guest_id
          AND c.hotel_id = r.hotel_id
          AND m.role = 'assistant'
          AND m.created_at > r.check_in::timestamp
          AND m.content LIKE '%bienvenid%'
      )
    LIMIT 50
  `);
  
  for (const row of rows) {
    try {
      const message = await generateAutomatedMessage('welcome', row);
      await sendMessage(row.phone, message, row.whatsapp_token);
      
      const conv = await getOrCreateConvForAutomation(row);
      await saveAutomationMessage(conv.id, message);
      
      console.log(`✉️ Bienvenida enviada a ${row.phone}`);
    } catch (e) {
      console.error(`Error bienvenida ${row.phone}:`, e.message);
    }
  }
}

// --- CHECKOUT (día del checkout) ---
async function sendCheckoutMessages() {
  const { rows } = await pool.query(`
    SELECT r.*, g.phone, g.name, g.language,
           h.name as hotel_name, h.settings, h.whatsapp_token
    FROM reservations r
    JOIN guests g ON g.id = r.guest_id
    JOIN hotels h ON h.id = r.hotel_id
    WHERE r.status = 'checked_in'
      AND r.check_out = CURRENT_DATE
      AND EXTRACT(hour FROM NOW()) BETWEEN 8 AND 10
      AND NOT EXISTS (
        SELECT 1 FROM messages m
        JOIN conversations c ON c.id = m.conversation_id
        WHERE c.guest_id = r.guest_id
          AND c.hotel_id = r.hotel_id
          AND m.role = 'assistant'
          AND DATE(m.created_at) = CURRENT_DATE
          AND m.content LIKE '%checkout%'
      )
    LIMIT 50
  `);
  
  for (const row of rows) {
    try {
      const message = await generateAutomatedMessage('checkout', row);
      await sendMessage(row.phone, message, row.whatsapp_token);
      console.log(`✉️ Checkout enviado a ${row.phone}`);
    } catch (e) {
      console.error(`Error checkout ${row.phone}:`, e.message);
    }
  }
}

// --- POST-ESTADÍA: pedir reseña (24-48hs después) ---
async function sendPostStayReviews() {
  const { rows } = await pool.query(`
    SELECT r.*, g.phone, g.name, g.language,
           h.name as hotel_name, h.settings, h.whatsapp_token,
           h.settings->>'google_maps_url' as google_url
    FROM reservations r
    JOIN guests g ON g.id = r.guest_id
    JOIN hotels h ON h.id = r.hotel_id
    LEFT JOIN reviews rev ON rev.reservation_id = r.id
    WHERE r.status = 'checked_out'
      AND r.check_out = CURRENT_DATE - INTERVAL '1 day'
      AND rev.id IS NULL
    LIMIT 50
  `);
  
  for (const row of rows) {
    try {
      const message = await generateAutomatedMessage('post_stay_review', row);
      await sendMessage(row.phone, message, row.whatsapp_token);
      
      // Marcar que se envió la solicitud de review
      await pool.query(
        `INSERT INTO reviews (hotel_id, guest_id, reservation_id, google_review_requested)
         VALUES ($1, $2, $3, true)`,
        [row.hotel_id, row.guest_id, row.id]
      );
      
      console.log(`✉️ Review request enviado a ${row.phone}`);
    } catch (e) {
      console.error(`Error review ${row.phone}:`, e.message);
    }
  }
}

// --- ACTIVIDADES DEL DÍA ---
async function sendDailyActivities() {
  const { rows } = await pool.query(`
    SELECT DISTINCT g.phone, g.name, g.language,
           h.name as hotel_name, h.whatsapp_token,
           h.settings->>'daily_activities' as activities
    FROM reservations r
    JOIN guests g ON g.id = r.guest_id
    JOIN hotels h ON h.id = r.hotel_id
    WHERE r.status = 'checked_in'
      AND h.settings->>'daily_activities' IS NOT NULL
  `);
  
  for (const row of rows) {
    if (!row.activities) continue;
    try {
      const message = `Buenos días ${row.name?.split(' ')[0] || ''}! ☀️\n\nActividades de hoy en ${row.hotel_name}:\n${row.activities}\n\n¿Necesitás reservar alguna?`;
      await sendMessage(row.phone, message, row.whatsapp_token);
    } catch (e) {
      console.error(`Error daily activities ${row.phone}:`, e.message);
    }
  }
}

// --- CUMPLEAÑOS ---
async function sendBirthdayGreetings() {
  const { rows } = await pool.query(`
    SELECT g.*, h.name as hotel_name, h.whatsapp_token, h.settings
    FROM guests g
    JOIN hotels h ON h.id = g.hotel_id
    WHERE g.memory->>'birth_date' IS NOT NULL
      AND TO_CHAR(NOW(), 'MM-DD') = TO_CHAR((g.memory->>'birth_date')::date, 'MM-DD')
  `);
  
  for (const row of rows) {
    try {
      const discount = row.settings?.birthday_discount || 15;
      const message = `¡Feliz cumpleaños ${row.name?.split(' ')[0]}! 🎉🎂\n\nDe parte de todo el equipo de ${row.hotel_name}, te deseamos un día increíble!\n\nComo regalo especial, tenés un ${discount}% de descuento en tu próxima estadía. 🎁\n\n¡Esperamos verte pronto!`;
      await sendMessage(row.phone, message, row.whatsapp_token);
    } catch (e) {
      console.error(`Error birthday ${row.phone}:`, e.message);
    }
  }
}

// ============================================================
// GENERAR MENSAJES CON CLAUDE
// ============================================================

async function generateAutomatedMessage(type, data) {
  const prompts = {
    pre_checkin: `Escribí un mensaje de WhatsApp de pre-check-in para el huésped ${data.name || 'huésped'} del ${data.hotel_name}. 
      Check-in mañana. 
      Ofrecé: traslado ($${data.settings?.transfer_price || 15}), early check-in ($${data.settings?.early_checkin_price || 20}), reserva en restaurante.
      Idioma: ${data.language || 'español'}. 
      Máximo 5 líneas. Cálido y personal.`,
      
    welcome: `Escribí un mensaje de bienvenida para ${data.name || 'huésped'} que acaba de hacer check-in en ${data.hotel_name}.
      Presentate como Julia la asistente virtual.
      Decile que estás disponible 24/7 para lo que necesite.
      Idioma: ${data.language || 'español'}. Máximo 4 líneas.`,
      
    checkout: `Escribí un mensaje de checkout para ${data.name || 'huésped'} del ${data.hotel_name}.
      Es su último día. Ofrecé late checkout ($${data.settings?.late_checkout_price || 20}) y traslado al aeropuerto.
      Idioma: ${data.language || 'español'}. Máximo 4 líneas.`,
      
    post_stay_review: `Escribí un mensaje post-estadía para ${data.name || 'huésped'} del ${data.hotel_name}.
      Preguntá brevemente cómo fue su experiencia.
      Si tienen link de Google Maps: ${data.google_url || 'no disponible'}
      Idioma: ${data.language || 'español'}. Máximo 4 líneas. No presiones.`,
  };
  
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 300,
    messages: [{ role: 'user', content: prompts[type] }],
  });
  
  return response.content[0].text;
}

// ============================================================
// HELPERS
// ============================================================

async function getOrCreateConvForAutomation(row) {
  const { rows } = await pool.query(
    `SELECT * FROM conversations 
     WHERE hotel_id = $1 AND guest_id = $2
       AND status NOT IN ('resolved')
     ORDER BY last_message_at DESC LIMIT 1`,
    [row.hotel_id, row.guest_id]
  );
  
  if (rows.length > 0) return rows[0];
  
  const { rows: created } = await pool.query(
    `INSERT INTO conversations (hotel_id, guest_id, status, column_name)
     VALUES ($1, $2, 'in_progress', 'En proceso')
     RETURNING *`,
    [row.hotel_id, row.guest_id]
  );
  
  return created[0];
}

async function saveAutomationMessage(convId, text) {
  await pool.query(
    `INSERT INTO messages (conversation_id, role, content)
     VALUES ($1, 'assistant', $2)`,
    [convId, text]
  );
  
  await pool.query(
    `UPDATE conversations SET last_message = $1, last_message_at = NOW() WHERE id = $2`,
    [text.substring(0, 255), convId]
  );
}

module.exports = { startSchedulers };
