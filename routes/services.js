const express = require('express');
const { pool } = require('../database');
const auth = require('../middleware/auth');

const router = express.Router();

router.get('/', auth(), async (req, res) => {
    try {
        const { hotel_id } = req.query;
        if (!hotel_id) return res.status(400).json({ error: 'hotel_id requerido' });

        const { rows } = await pool.query(
            "SELECT * FROM services WHERE hotel_id = $1 ORDER BY category, name",
            [hotel_id]
        );

        if (rows.length === 0) {
            // MOCK para desarrollo
            const MOCK_SERVICES = [
                { id: 1, name: "Traslado aeropuerto", price: 15, category: "pre_stay", active: true },
                { id: 2, name: "Early check-in", price: 20, category: "pre_stay", active: true },
                { id: 4, name: "Sesión spa", price: 80, category: "during_stay", active: true },
                { id: 7, name: "Late check-out", price: 20, category: "checkout", active: true },
            ];
            return res.json(MOCK_SERVICES);
        }

        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error interno' });
    }
});

module.exports = router;
