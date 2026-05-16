const express = require('express');
const { supabase } = require('../services/supabaseClient');
const auth = require('../middleware/auth');

const router = express.Router();

router.get('/', auth(), async (req, res) => {
    try {
        const hotelId = req.user.hotel_id;
        if (!hotelId && req.user.role !== 'super_admin') {
            return res.status(400).json({ error: 'hotel_id no asociado al usuario' });
        }

        const today = new Date().toISOString().split('T')[0];
        const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

        const [
            { count: totalGuests, error: e1 },
            { count: activeReservations, error: e2 },
            { count: reservationsMonth, error: e3 },
            { count: totalConversations, error: e4 },
            { data: conversations, error: e5 }
        ] = await Promise.all([
            supabase.from('guests').select('*', { count: 'exact', head: true }).eq('hotel_id', hotelId),
            supabase.from('reservations').select('*', { count: 'exact', head: true }).eq('hotel_id', hotelId).eq('status', 'in_house'),
            supabase.from('reservations').select('*', { count: 'exact', head: true }).eq('hotel_id', hotelId).gte('check_in', firstOfMonth),
            supabase.from('conversations').select('*', { count: 'exact', head: true }).eq('hotel_id', hotelId),
            supabase.from('conversations').select('id').eq('hotel_id', hotelId)
        ]);

        const firstError = e1 || e2 || e3 || e4 || e5;
        if (firstError) return res.status(500).json({ error: firstError.message });

        let messages_today = 0;
        if (conversations && conversations.length > 0) {
            const convIds = conversations.map(c => c.id);
            const { count: msgCount } = await supabase
                .from('messages')
                .select('*', { count: 'exact', head: true })
                .in('conversation_id', convIds)
                .gte('created_at', today);
            messages_today = msgCount ?? 0;
        }

        return res.json({
            total_guests: totalGuests ?? 0,
            active_reservations: activeReservations ?? 0,
            reservations_month: reservationsMonth ?? 0,
            messages_today,
            total_conversations: totalConversations ?? 0,
            upselling_revenue: null
        });
    } catch (err) {
        console.error('[analytics GET /] Error:', err.message);
        return res.status(500).json({ error: 'Database error', detail: err.message });
    }
});

module.exports = router;
