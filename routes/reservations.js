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
            .select('*, guests(name, email, phone)')
            .eq('hotel_id', hotelId)
            .order('check_in', { ascending: false });

        if (status) {
            query = query.eq('status', status);
        }

        const { data, error } = await query;

        if (error) return res.status(500).json({ error: error.message });

        return res.json(data);
    } catch (err) {
        console.error('[reservations GET /] Error:', err.message);
        return res.status(500).json({ error: 'Database error', detail: err.message });
    }
});

module.exports = router;
