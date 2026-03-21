const express = require('express');
const { pool } = require('../database');
const auth = require('../middleware/auth');

const router = express.Router();

router.get('/', auth(['super_admin']), async (req, res) => {
    try {
        // Return mock hotels for now until real DB population tool is ready
        const MOCK_HOTELS = [
            { id: "h1", name: "Hotel Interamericano", location: "Bariloche, Argentina", plan: "Pro", status: "active", guests: 1247, revenue_month: 4820, conversations_today: 34, whatsapp: "+5492944123456", created: "2024-01-15", bot_active: true, modules: ["reservas", "huespedes", "automatizacion", "marketing"] },
            { id: "h2", name: "Llao Llao Resort", location: "Bariloche, Argentina", plan: "Pro", status: "active", guests: 3841, revenue_month: 12340, conversations_today: 89, whatsapp: "+5492944987654", created: "2024-02-01", bot_active: true, modules: ["reservas", "huespedes", "automatizacion", "marketing"] }
        ];
        res.json(MOCK_HOTELS);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error interno' });
    }
});

router.get('/:id', auth(['super_admin', 'hotel_manager']), async (req, res) => {
    try {
        const { id } = req.params;

        // Propiedad: Si es manager, solo puede ver SU hotel
        if (req.user.role === 'hotel_manager' && req.user.hotel_id !== id) {
            return res.status(403).json({ error: 'Acceso denegado a este hotel' });
        }

        const { rows } = await pool.query('SELECT * FROM hotels WHERE id = $1', [id]);
        if (rows.length === 0) {
            // Return mock for development if id is h1
            if (id === 'h1') return res.json({ id: "h1", name: "Hotel Interamericano", location: "Bariloche, Argentina", bot_name: "Julia", bot_active: true });
            return res.status(404).json({ error: 'Hotel no encontrado' });
        }
        res.json(rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error interno' });
    }
});

module.exports = router;
