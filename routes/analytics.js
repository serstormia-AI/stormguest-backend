const express = require('express');
const { pool } = require('../database');
const auth = require('../middleware/auth');

const router = express.Router();

router.get('/', auth(), async (req, res) => {
    try {
        const hotelId = req.user.hotel_id;
        if (!hotelId && req.user.role !== 'super_admin') {
            return res.status(400).json({ error: 'hotel_id no asociado al usuario' });
        }

        const [
            totalGuestsResult,
            activeReservationsResult,
            reservationsMonthResult,
            messagesTodayResult,
            totalConversationsResult
        ] = await Promise.all([
            pool.query(
                'SELECT COUNT(*) AS count FROM guests WHERE hotel_id = $1',
                [hotelId]
            ),
            pool.query(
                "SELECT COUNT(*) AS count FROM reservations WHERE hotel_id = $1 AND status = 'in_house'",
                [hotelId]
            ),
            pool.query(
                "SELECT COUNT(*) AS count FROM reservations WHERE hotel_id = $1 AND DATE_TRUNC('month', check_in) = DATE_TRUNC('month', CURRENT_DATE)",
                [hotelId]
            ),
            pool.query(
                `SELECT COUNT(*) AS count
                 FROM messages m
                 JOIN conversations c ON m.conversation_id = c.id
                 WHERE c.hotel_id = $1 AND DATE(m.created_at) = CURRENT_DATE`,
                [hotelId]
            ),
            pool.query(
                'SELECT COUNT(*) AS count FROM conversations WHERE hotel_id = $1',
                [hotelId]
            )
        ]);

        return res.json({
            total_guests: parseInt(totalGuestsResult.rows[0].count, 10),
            active_reservations: parseInt(activeReservationsResult.rows[0].count, 10),
            reservations_month: parseInt(reservationsMonthResult.rows[0].count, 10),
            messages_today: parseInt(messagesTodayResult.rows[0].count, 10),
            total_conversations: parseInt(totalConversationsResult.rows[0].count, 10),
            // Revenue module not yet implemented — returns null until payments are added
            upselling_revenue: null
        });
    } catch (err) {
        console.error('[analytics GET /] Error:', err.message);
        return res.status(500).json({ error: 'Database error', detail: err.message });
    }
});

module.exports = router;
