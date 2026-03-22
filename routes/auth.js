const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { pool } = require('../database');

const router = express.Router();

router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        // For now, mock authentication response since we don't have users table fully populated
        // We will hardcode the demo users here to simulate DB lookup

        const DEMO_USERS = {
            "admin@serstorm.com": { role: "super_admin", hotel_id: "all", name: "Admin" },
            "gerente@interamericano.com": { role: "hotel_manager", hotel_id: "h1", name: "Carlos" },
            "recepcion@interamericano.com": { role: "reception", hotel_id: "h1", name: "Ana" }
        };

        const user = DEMO_USERS[email];
        if (!user) {
            return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
        }

        // Accept hardcoded passwords
        if ((email === "admin@serstorm.com" && password === "storm2024") ||
            (email === "gerente@interamericano.com" && password === "hotel2024") ||
            (email === "recepcion@interamericano.com" && password === "recepcion2024")) {

            const token = jwt.sign(
                { email, role: user.role, hotel_id: user.hotel_id, name: user.name },
                process.env.JWT_SECRET || 'stormguest_secret_123',
                { expiresIn: '24h' }
            );

            return res.json({ token, role: user.role, hotel_id: user.hotel_id, name: user.name });
        }

        res.status(401).json({ error: 'Contraseña incorrecta' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

module.exports = router;
