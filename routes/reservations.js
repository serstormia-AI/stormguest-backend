const express = require('express');
const { supabase } = require('../services/supabaseClient');
const auth = require('../middleware/auth');

const router = express.Router();

router.get('/', auth(), async (req, res) => {
    try {
        const hotelId = req.user.hotel_id;
        if (!hotelId && req.user.role !== 'super_admin') return res.status(400).json({ error: 'hotel_id no asociado al usuario' });

        const { status } = req.query;

        let query = supabase
            .from('reservations')
            .select('*')
            .eq('hotel_id', hotelId)
            .order('check_in', { ascending: false });

        if (status) query = query.eq('status', status);

        const { data: reservations, error } = await query;
        if (error) return res.status(500).json({ error: error.message });

        if (!reservations || reservations.length === 0) return res.json([]);

        const guestIds = [...new Set(reservations.map(r => r.guest_id).filter(Boolean))];
        let guestsMap = {};

        if (guestIds.length > 0) {
            const { data: guests } = await supabase
                .from('guests')
                .select('id, name, email, phone')
                .in('id', guestIds);
            if (guests) guests.forEach(g => { guestsMap[g.id] = g; });
        }

        const result = reservations.map(r => ({
            ...r,
            guest: guestsMap[r.guest_id] ?? null
        }));

        return res.json(result);
    } catch (err) {
        console.error('[reservations GET /] Error:', err.message);
        return res.status(500).json({ error: 'Database error', detail: err.message });
    }
});

module.exports = router;
