const express = require('express');
const { supabase } = require('../services/supabaseClient');
const auth = require('../middleware/auth');

const router = express.Router();

router.get('/', auth(), async (req, res) => {
    try {
        const { hotel_id } = req.user;
        if (!hotel_id) return res.status(400).json({ error: 'hotel_id no asociado al usuario' });

        // Fetch reviews without join (no FK constraints in Supabase)
        const { data: reviews, error: reviewsError } = await supabase
            .from('reviews')
            .select('*')
            .eq('hotel_id', hotel_id)
            .order('created_at', { ascending: false });

        if (reviewsError) throw reviewsError;

        // Collect unique guest_ids
        const guestIds = [...new Set(reviews.map((r) => r.guest_id).filter(Boolean))];

        // Fetch guests separately
        let guestsMap = {};
        if (guestIds.length > 0) {
            const { data: guests, error: guestsError } = await supabase
                .from('guests')
                .select('id, name, email')
                .in('id', guestIds);

            if (guestsError) throw guestsError;

            guestsMap = Object.fromEntries((guests || []).map((g) => [g.id, g]));
        }

        // Merge guests into reviews
        const merged = reviews.map((review) => ({
            ...review,
            guests: guestsMap[review.guest_id] || null,
        }));

        return res.json(merged);
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

router.put('/:id', auth(), async (req, res) => {
    try {
        const { hotel_id } = req.user;
        if (!hotel_id) return res.status(400).json({ error: 'hotel_id no asociado al usuario' });

        const { id } = req.params;
        const { responded, response_text } = req.body;

        // Build update payload with only allowed fields
        const updates = {};
        if (typeof responded === 'boolean') updates.responded = responded;
        if (typeof response_text === 'string') updates.response_text = response_text;

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ error: 'No hay campos válidos para actualizar' });
        }

        // Update only if hotel_id matches (ownership check via eq filter)
        const { data, error } = await supabase
            .from('reviews')
            .update(updates)
            .eq('id', id)
            .eq('hotel_id', hotel_id)
            .select()
            .single();

        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'Reseña no encontrada o no autorizada' });

        return res.json(data);
    } catch (err) {
        console.error('[reviews PUT /:id] Error:', err.message);
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
