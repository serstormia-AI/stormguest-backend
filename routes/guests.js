const express = require('express');
const { pool } = require('../database');
const auth = require('../middleware/auth');

const router = express.Router();

router.get('/', auth(), async (req, res) => {
    try {
        const hotelId = req.user.hotel_id;
        if (!hotelId && req.user.role !== 'super_admin') return res.status(400).json({ error: 'hotel_id no asociado al usuario' });

        const { rows } = await pool.query(
            `SELECT g.*,
                    c.status AS conversation_status,
                    c.last_message_at,
                    (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.role = 'user'
                        AND m.created_at > COALESCE(c.last_message_at - INTERVAL '1 second', '1970-01-01')) AS unread
             FROM guests g
             LEFT JOIN conversations c ON c.guest_id = g.id AND c.hotel_id = g.hotel_id
             WHERE g.hotel_id = $1
             ORDER BY g.last_contact DESC`,
            [hotelId]
        );

        return res.json(rows);
    } catch (err) {
        console.error('[guests GET /] Error:', err.message);
        return res.status(500).json({ error: 'Database error', detail: err.message });
    }
});

module.exports = router;
