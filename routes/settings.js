const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { supabase } = require('../services/supabaseClient');

// GET /api/settings — devuelve config del hotel (sin smtp_pass)
router.get('/', auth(), async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('hotels')
            .select('id, name, system_prompt, smtp_host, smtp_port, smtp_user, smtp_from, settings')
            .eq('id', req.user.hotel_id)
            .single();

        if (error || !data) {
            return res.status(404).json({ error: 'Hotel no encontrado' });
        }

        return res.json(data);
    } catch (err) {
        console.error('[settings] Error en GET /:', err);
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// PUT /api/settings — actualiza solo los campos enviados en el body
router.put('/', auth(), async (req, res) => {
    const allowed = ['system_prompt', 'smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_from', 'settings'];
    const updates = {};

    for (const key of allowed) {
        if (key in req.body) {
            updates[key] = req.body[key];
        }
    }

    if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No se enviaron campos válidos para actualizar' });
    }

    try {
        const { data, error } = await supabase
            .from('hotels')
            .update(updates)
            .eq('id', req.user.hotel_id)
            .select('id, name, system_prompt, smtp_host, smtp_port, smtp_user, smtp_from, settings')
            .single();

        if (error) {
            console.error('[settings] Error en PUT /:', error);
            return res.status(500).json({ error: 'Error al guardar configuración' });
        }

        return res.json({ ok: true, data });
    } catch (err) {
        console.error('[settings] Error en PUT /:', err);
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
});

module.exports = router;
