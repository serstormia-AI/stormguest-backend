const express = require('express');
const { supabase } = require('../services/supabaseClient');
const auth = require('../middleware/auth');

const router = express.Router();

router.get('/', auth(), async (req, res) => {
    try {
        const { hotel_id } = req.user;
        if (!hotel_id) return res.status(400).json({ error: 'hotel_id no asociado al usuario' });

        const { data, error } = await supabase
            .from('reviews')
            .select(`*, guests(id, name, email)`)
            .eq('hotel_id', hotel_id)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return res.json(data);
    } catch (err) {
        console.error('[reviews GET /] Error:', err.message);
        return res.status(500).json({ error: 'Database error', detail: err.message });
    }
});

router.post('/', auth(), async (req, res) => {
    try {
        const { hotel_id } = req.user;
        if (!hotel_id) return res.status(400).json({ error: 'hotel_id no asociado al usuario' });

        const { guest_id, reservation_id, rating, comment } = req.body;
        if (!guest_id || !rating) return res.status(400).json({ error: 'guest_id y rating son requeridos' });
        if (rating < 1 || rating > 5) return res.status(400).json({ error: 'rating debe estar entre 1 y 5' });

        const { data, error } = await supabase
            .from('reviews')
            .insert([{ hotel_id, guest_id, reservation_id: reservation_id || null, rating, comment: comment || null }])
            .select()
            .single();

        if (error) throw error;
        return res.status(201).json(data);
    } catch (err) {
        console.error('[reviews POST /] Error:', err.message);
        return res.status(500).json({ error: 'Database error', detail: err.message });
    }
});

router.delete('/:id', auth(), async (req, res) => {
    try {
        const { hotel_id } = req.user;
        if (!hotel_id) return res.status(400).json({ error: 'hotel_id no asociado al usuario' });

        const { id } = req.params;
        const { error } = await supabase
            .from('reviews')
            .delete()
            .eq('id', id)
            .eq('hotel_id', hotel_id);

        if (error) throw error;
        return res.json({ success: true });
    } catch (err) {
        console.error('[reviews DELETE /:id] Error:', err.message);
        return res.status(500).json({ error: 'Database error', detail: err.message });
    }
});

module.exports = router;
