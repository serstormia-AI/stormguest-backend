const express = require('express');
const { supabase } = require('../services/supabaseClient');
const auth = require('../middleware/auth');

const router = express.Router();

router.get('/', auth(), async (req, res) => {
    try {
        const hotelId = req.user.hotel_id;
        if (!hotelId && req.user.role !== 'super_admin') return res.status(400).json({ error: 'hotel_id no asociado al usuario' });

        // Fetch guests with their latest conversation data via left join
        const { data, error } = await supabase
            .from('guests')
            .select('*, conversations(status, last_message_at, messages(id, role, created_at))')
            .eq('hotel_id', hotelId)
            .order('last_contact', { ascending: false });

        if (error) return res.status(500).json({ error: error.message });

        // Flatten to match original shape: conversation_status, last_message_at, unread count
        const result = data.map(guest => {
            const conv = guest.conversations?.[0] ?? null;
            let unread = 0;
            if (conv?.messages) {
                const cutoff = conv.last_message_at ? new Date(new Date(conv.last_message_at).getTime() - 1000) : new Date(0);
                unread = conv.messages.filter(m => m.role === 'user' && new Date(m.created_at) > cutoff).length;
            }
            const { conversations, ...guestData } = guest;
            return {
                ...guestData,
                conversation_status: conv?.status ?? null,
                last_message_at: conv?.last_message_at ?? null,
                unread
            };
        });

        return res.json(result);
    } catch (err) {
        console.error('[guests GET /] Error:', err.message);
        return res.status(500).json({ error: 'Database error', detail: err.message });
    }
});

module.exports = router;
