const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { supabase } = require('../services/supabaseClient');
const emailService = require('../services/emailService');

// POST /api/notifications/send — envía email manual a un huésped
router.post('/send', auth(), async (req, res) => {
    const { guest_id, subject, message } = req.body;

    if (!guest_id || !subject || !message) {
        return res.status(400).json({ error: 'guest_id, subject y message son requeridos' });
    }

    try {
        // Buscar el guest en Supabase
        const { data: guest, error } = await supabase
            .from('guests')
            .select('id, name, email, hotel_id')
            .eq('id', guest_id)
            .eq('hotel_id', req.user.hotel_id)
            .single();

        if (error || !guest) {
            return res.status(404).json({ error: 'Huésped no encontrado' });
        }

        if (!guest.email) {
            return res.status(200).json({ sent: false, reason: 'guest_has_no_email' });
        }

        // Obtener config SMTP del hotel para usar su propio servidor si está configurado
        const { data: hotel } = await supabase
            .from('hotels')
            .select('smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from')
            .eq('id', req.user.hotel_id)
            .single();

        const result = await emailService.sendCustomEmail({
            to: guest.email,
            name: guest.name,
            subject,
            message,
        }, hotel || null);

        return res.status(200).json({
            sent: result.sent,
            reason: result.reason || null,
            guest: { id: guest.id, name: guest.name, email: guest.email },
            subject,
        });
    } catch (err) {
        console.error('[notifications] Error en POST /send:', err);
        // Respondemos 200 aunque falle, con sent: false
        return res.status(200).json({ sent: false, reason: err.message });
    }
});

// GET /api/notifications/test — envía email de prueba al usuario logueado
router.get('/test', auth(), async (req, res) => {
    const to = req.user.email;

    if (!to) {
        return res.status(400).json({ error: 'El usuario no tiene email registrado' });
    }

    try {
        // Obtener config SMTP del hotel para el email de prueba
        const { data: hotel } = await supabase
            .from('hotels')
            .select('smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from')
            .eq('id', req.user.hotel_id)
            .single();

        const result = await emailService.sendTestEmail(to, hotel || null);
        return res.status(200).json({ sent: result.sent, reason: result.reason || null, to });
    } catch (err) {
        console.error('[notifications] Error en GET /test:', err);
        return res.status(200).json({ sent: false, reason: err.message });
    }
});

module.exports = router;
