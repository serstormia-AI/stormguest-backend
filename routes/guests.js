const express = require('express');
const { supabase } = require('../services/supabaseClient');
const auth = require('../middleware/auth');

const router = express.Router();

router.get('/', auth(), async (req, res) => {
    try {
        const hotelId = req.user.hotel_id;
        if (!hotelId && req.user.role !== 'super_admin') return res.status(400).json({ error: 'hotel_id no asociado al usuario' });

        const { data: guests, error } = await supabase
            .from('guests')
            .select('*')
            .eq('hotel_id', hotelId)
            .order('created_at', { ascending: false });

        if (error) return res.status(500).json({ error: error.message });
        if (!guests || guests.length === 0) return res.json([]);

        const guestIds = guests.map(g => g.id);

        const { data: conversations } = await supabase
            .from('conversations')
            .select('id, guest_id, status, updated_at')
            .eq('hotel_id', hotelId)
            .in('guest_id', guestIds);

        const convsMap = {};
        if (conversations) {
            conversations.forEach(c => {
                if (!convsMap[c.guest_id] || c.updated_at > convsMap[c.guest_id].updated_at) {
                    convsMap[c.guest_id] = c;
                }
            });
        }

        const result = guests.map(g => ({
            ...g,
            conversation_status: convsMap[g.id]?.status ?? null,
            last_message_at: convsMap[g.id]?.updated_at ?? null,
            unread: 0
        }));

        return res.json(result);
    } catch (err) {
        console.error('[guests GET /] Error:', err.message);
        return res.status(500).json({ error: 'Database error', detail: err.message });
    }
});

module.exports = router;
