const express = require('express');
const { pool } = require('../database');
const auth = require('../middleware/auth');

const router = express.Router();

router.get('/', auth(), async (req, res) => {
    try {
        const hotelId = req.user.hotel_id;

        // Mock analytics for development
        const MOCK_METRICS = {
            active_guests: 42,
            reservations_month: 128,
            upselling_revenue: 3450,
            bot_conversations: 856,
            automation_hours_saved: 124,
            avg_resolution_time: "4m"
        };

        res.json(MOCK_METRICS);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error interno' });
    }
});

module.exports = router;
