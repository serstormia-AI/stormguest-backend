const express = require('express');
const { pool } = require('../database');
const auth = require('../middleware/auth');

const router = express.Router();

router.get('/', auth(), async (req, res) => {
    try {
        const hotelId = req.user.hotel_id;
        if (!hotelId && req.user.role !== 'super_admin') return res.status(400).json({ error: 'hotel_id no asociado al usuario' });

        const { status } = req.query;
        const params = [hotelId];
        let whereClause = 'WHERE r.hotel_id = $1';

        if (status) {
            params.push(status);
            whereClause += ` AND r.status = $${params.length}`;
        }

        const { rows } = await pool.query(
            `SELECT r.*, g.name AS guest_name, g.phone AS guest_phone, g.tags AS guest_tags
             FROM reservations r
             JOIN guests g ON r.guest_id = g.id
             ${whereClause}
             ORDER BY r.check_in DESC`,
            params
        );

        return res.json(rows);
    } catch (err) {
        console.error('[reservations GET /] Error:', err.message);
        return res.status(500).json({ error: 'Database error', detail: err.message });
    }
});

module.exports = router;
