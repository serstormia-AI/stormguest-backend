const express = require('express');
const { supabase } = require('../services/supabaseClient');
const auth = require('../middleware/auth');

const router = express.Router();

router.get('/', auth(), async (req, res) => {
    try {
        const { hotel_id } = req.query;
        if (!hotel_id) return res.status(400).json({ error: 'hotel_id requerido' });

        const { data, error } = await supabase
            .from('services')
            .select('*')
            .eq('hotel_id', hotel_id)
            .eq('active', true)
            .order('category', { ascending: true })
            .order('name', { ascending: true });

        if (error) return res.status(500).json({ error: error.message });

        return res.json(data);
    } catch (err) {
        console.error('[services GET /] Error:', err.message);
        return res.status(500).json({ error: 'Database error', detail: err.message });
    }
});

module.exports = router;
