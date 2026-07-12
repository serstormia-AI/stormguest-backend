const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { supabase } = require('../services/supabaseClient');

const router = express.Router();

router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || typeof email !== 'string' || email.trim() === '') {
        return res.status(400).json({ error: 'El campo email es requerido' });
    }
    if (!password || typeof password !== 'string' || password.trim() === '') {
        return res.status(400).json({ error: 'El campo password es requerido' });
    }
    // Security: bcrypt truncates at 72 bytes — reject longer passwords to prevent DoS
    if (password.length > 72) {
        return res.status(400).json({ error: 'El password no puede superar los 72 caracteres' });
    }

    try {
        const { data, error } = await supabase
            .from('users')
            .select('id, email, password_hash, role, hotel_id, name, auth_user_id')
            .eq('email', email.trim().toLowerCase())
            .single();

        if (error || !data) {
            return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
        }

        const rows = [data];

        const user = rows[0];

        const passwordMatch = await bcrypt.compare(password, user.password_hash);
        if (!passwordMatch) {
            return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
        }

        // Sync password to Supabase Auth so the frontend can get a real Supabase session
        // via signInWithPassword (needed for RLS auth.uid() to work with the anon client).
        if (user.auth_user_id) {
            supabase.auth.admin.updateUserById(user.auth_user_id, { password }).catch(() => {});
        }

        // Fix 2: JWT_SECRET must exist (validated at startup, but guard here too)
        const secret = process.env.JWT_SECRET;
        if (!secret) {
            console.error('FATAL: JWT_SECRET no está definido');
            return res.status(500).json({ error: 'Error de configuración del servidor' });
        }

        const token = jwt.sign(
            { email: user.email, role: user.role, hotel_id: user.hotel_id, name: user.name },
            secret,
            { expiresIn: '24h' }
        );

        // Same JSON shape as before to keep frontend compatibility
        return res.json({ token, role: user.role, hotel_id: user.hotel_id, name: user.name });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

module.exports = router;
