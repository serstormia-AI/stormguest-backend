const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { supabase } = require('../services/supabaseClient');
const { encryptField, decryptField } = require('../services/crypto');

// GET /api/settings — devuelve config del hotel (sin smtp_pass, sin claves secretas)
router.get('/', auth(), async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('hotels')
            .select('id, name, system_prompt, smtp_host, smtp_port, smtp_user, smtp_from, settings, stripe_publishable_key, stripe_secret_key_enc, stripe_webhook_secret_enc')
            .eq('id', req.user.hotel_id)
            .single();

        if (error || !data) {
            return res.status(404).json({ error: 'Hotel no encontrado' });
        }

        return res.json({
            id: data.id,
            name: data.name,
            system_prompt: data.system_prompt,
            smtp_host: data.smtp_host,
            smtp_port: data.smtp_port,
            smtp_user: data.smtp_user,
            smtp_from: data.smtp_from,
            settings: data.settings,
            stripe_publishable_key: data.stripe_publishable_key || '',
            has_stripe_secret: !!decryptField(data.stripe_secret_key_enc),
            has_stripe_webhook: !!decryptField(data.stripe_webhook_secret_enc),
        });
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

    // Stripe: clave publicable (texto plano)
    if ('stripe_publishable_key' in req.body) {
        updates.stripe_publishable_key = req.body.stripe_publishable_key || null;
    }

    // Stripe: clave secreta → encriptar
    if ('stripe_secret_key' in req.body && req.body.stripe_secret_key) {
        const enc = encryptField(req.body.stripe_secret_key);
        if (enc) {
            updates.stripe_secret_key_enc = enc;
        } else {
            return res.status(500).json({ error: 'Error al encriptar stripe_secret_key. Verificá ENCRYPTION_KEY.' });
        }
    }

    // Stripe: webhook secret → encriptar
    if ('stripe_webhook_secret' in req.body && req.body.stripe_webhook_secret) {
        const enc = encryptField(req.body.stripe_webhook_secret);
        if (enc) {
            updates.stripe_webhook_secret_enc = enc;
        } else {
            return res.status(500).json({ error: 'Error al encriptar stripe_webhook_secret. Verificá ENCRYPTION_KEY.' });
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
            .select('id, name, system_prompt, smtp_host, smtp_port, smtp_user, smtp_from, settings, stripe_publishable_key, stripe_secret_key_enc, stripe_webhook_secret_enc')
            .single();

        if (error) {
            console.error('[settings] Error en PUT /:', error);
            return res.status(500).json({ error: 'Error al guardar configuración' });
        }

        return res.json({
            ok: true,
            data: {
                id: data.id,
                name: data.name,
                system_prompt: data.system_prompt,
                smtp_host: data.smtp_host,
                smtp_port: data.smtp_port,
                smtp_user: data.smtp_user,
                smtp_from: data.smtp_from,
                settings: data.settings,
                stripe_publishable_key: data.stripe_publishable_key || '',
                has_stripe_secret: !!decryptField(data.stripe_secret_key_enc),
                has_stripe_webhook: !!decryptField(data.stripe_webhook_secret_enc),
            },
        });
    } catch (err) {
        console.error('[settings] Error en PUT /:', err);
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
});

module.exports = router;
