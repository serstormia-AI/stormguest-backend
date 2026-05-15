const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { pool } = require('../database');

const router = express.Router();

router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    // Fix 4: Input validation
    if (!email || typeof email !== 'string' || email.trim() === '') {
        return res.status(400).json({ error: 'El campo email es requerido' });
    }
    if (!password || typeof password !== 'string' || password.trim() === '') {
        return res.status(400).json({ error: 'El campo password es requerido' });
    }

    try {
        // Fix 1: Buscar usuario real en la base de datos
        const { rows } = await pool.query(
            'SELECT id, email, password_hash, role, hotel_id, name FROM users WHERE email = $1',
            [email.trim().toLowerCase()]
        );

        if (rows.length === 0) {
            return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
        }

        const user = rows[0];

        const passwordMatch = await bcrypt.compare(password, user.password_hash);
        if (!passwordMatch) {
            return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
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
