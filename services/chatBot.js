const { supabase } = require('./supabaseClient');
const { generateResponse } = require('./claudeAI');

let channel;

function startChatBotListener() {
    console.log('🤖 Iniciando ChatBot Listener con Supabase Realtime...');

    channel = supabase
        .channel('bot-listener')
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'messages',
                filter: `sender_type=eq.guest` // Solo escuchamos mensajes de los huéspedes
            },
            async (payload) => {
                const newMessage = payload.new;
                console.log(`📩 Mensaje recibido de Guest (${newMessage.guest_id}): "${newMessage.content}"`);

                try {
                    // 1. Obtener datos del Hotel
                    const { data: hotel, error: hotelErr } = await supabase
                        .from('hotels')
                        .select('*')
                        .eq('id', newMessage.hotel_id)
                        .single();
                        
                    if (hotelErr || !hotel) throw new Error('Hotel no encontrado');

                    // 2. Obtener datos del Guest
                    const { data: guest, error: guestErr } = await supabase
                        .from('guests')
                        .select('*')
                        .eq('id', newMessage.guest_id)
                        .single();
                        
                    if (guestErr || !guest) throw new Error('Guest no encontrado');

                    // 3. Obtener historial (últimos 15 mensajes)
                    const { data: history } = await supabase
                        .from('messages')
                        .select('*')
                        .eq('hotel_id', hotel.id)
                        .eq('guest_id', guest.id)
                        .order('created_at', { ascending: false })
                        .limit(15);
                    
                    // Invertir para que estén en orden cronológico, EXCLUYENDO el mensaje nuevo que ya procesamos arriba
                    const orderedHistory = (history || [])
                        .filter(m => m.id !== newMessage.id)
                        .reverse();

                    // 4. Generar respuesta con Claude
                    console.log('🧠 Pensando respuesta...');
                    const botReply = await generateResponse(hotel, guest, newMessage.content, orderedHistory);

                    // 5. Insertar respuesta de Claude en la base de datos
                    await supabase.from('messages').insert({
                        hotel_id: hotel.id,
                        guest_id: guest.id,
                        sender_type: 'bot',
                        content: botReply
                    });

                    console.log(`✅ Respuesta enviada: "${botReply}"`);

                } catch (err) {
                    console.error('❌ Error procesando mensaje de bot:', err);
                }
            }
        )
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log('✅ ChatBot suscrito exitosamente a Supabase Realtime');
            } else {
                console.warn('⚠️ ChatBot estado de suscripción:', status);
            }
        });
}

function stopChatBotListener() {
    if (channel) {
        supabase.removeChannel(channel);
        console.log('🛑 ChatBot Listener detenido.');
    }
}

module.exports = { startChatBotListener, stopChatBotListener };
