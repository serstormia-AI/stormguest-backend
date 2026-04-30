/**
 * OpenAI Service (Bot Brain)
 * Maneja contexto, stage del huésped y detección de intenciones para StormGuest
 */

const OpenAI = require('openai');
const { supabase } = require('./supabaseClient');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const BASE_SYSTEM_PROMPT = (hotel, guest) => `
Sos Julia, la asistente virtual de ${hotel.name}. Sos amable, profesional y eficiente.
Respondés siempre en el idioma del huésped (detectalo automáticamente).
Nunca revelés que sos una IA a menos que te lo pregunten directamente.
Mantené conversaciones cortas y directas. Máximo 3-4 líneas por respuesta.
Usá emojis con moderación para dar calidez.

HOTEL: ${hotel.name}

HUÉSPED ACTUAL:
- Nombre: ${guest.first_name || 'huésped'} ${guest.last_name || ''}
- Etiquetas: ${guest.tags?.join(', ') || 'sin clasificar'}

REGLAS DE NEGOCIO:
1. Si el huésped hace una solicitud operativa (limpieza, toallas, room service, desayuno) o pide comprar algo del hotel, confirmá amablemente y clasificalo internamente al final de tu respuesta como: [SOLICITUD:tipo]
2. Ejemplo: "Claro, enseguida envío toallas a tu habitación. [SOLICITUD:toallas]"
3. Si detectás información importante del viaje del huésped, marcala: [TAG:familia|pareja|amigos|negocios]
4. Sé proactiva: si pide algo de comer, recordale que puede ver el catálogo en la app.
`;

/**
 * Generar respuesta usando OpenAI
 */
async function generateResponse(hotel, guest, newMessage, messagesHistory) {
  try {
    // 1. Preparar historial para OpenAI
    const messages = messagesHistory.map(m => ({
      role: m.sender_type === 'guest' ? 'user' : 'assistant',
      content: m.content,
    }));
    
    // Agregar el prompt del sistema y el mensaje nuevo
    const fullMessages = [
      { role: 'system', content: BASE_SYSTEM_PROMPT(hotel, guest) },
      ...messages,
      { role: 'user', content: newMessage }
    ];

    // 2. Llamar a OpenAI (GPT-4o-mini es excelente para esto)
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: fullMessages,
      temperature: 0.7,
      max_tokens: 500
    });

    const responseText = completion.choices[0].message.content;

    // 3. Procesar comandos internos (Solicitudes y Tags)
    await processInternalCommands(responseText, hotel, guest);

    // 4. Limpiar el texto de comandos antes de enviarlo al huésped
    const cleanResponse = responseText
      .replace(/\[SOLICITUD:[^\]]+\]/g, '')
      .replace(/\[TAG:[^\]]+\]/g, '')
      .trim();

    return cleanResponse;

  } catch (error) {
    console.error("❌ Error en OpenAI Service:", error);
    return "Lo siento, tuve un pequeño problema técnico. ¿Podrías repetirme eso?";
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
      internal_note: `Pedido automático vía ChatBot: ${tipo}`
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

module.exports = { generateResponse };
