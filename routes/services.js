const express = require('express');
const { pool } = require('../database');
const auth = require('../middleware/auth');

const router = express.Router();

router.get('/', auth(), async (req, res) => {
    try {
        const { hotel_id } = req.query;
        if (!hotel_id) return res.status(400).json({ error: 'hotel_id requerido' });

        const { rows } = await pool.query(
            "SELECT * FROM services WHERE hotel_id = $1 AND active = true ORDER BY category, name",
            [hotel_id]
        );

        return res.json(rows);
    } catch (err) {
        console.error('[services GET /] Error:', err.message);
        return res.status(500).json({ error: 'Database error', detail: err.message });
    }
});

module.exports = router;
