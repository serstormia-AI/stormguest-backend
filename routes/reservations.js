const express = require('express');
const { pool } = require('../database');
const auth = require('../middleware/auth');

const router = express.Router();

router.get('/', auth(), async (req, res) => {
    try {
        const hotelId = req.user.hotel_id;
        if (!hotelId && req.user.role !== 'super_admin') return res.status(400).json({ error: 'hotel_id no asociado al usuario' });

        const { rows } = await pool.query(
            "SELECT r.*, g.name as guest_name, g.phone as guest_phone, g.tags as guest_tags " +
            "FROM reservations r " +
            "JOIN guests g ON r.guest_id = g.id " +
            "WHERE r.hotel_id = $1 " +
            "ORDER BY r.check_in DESC",
            [hotelId]
        );

        if (rows.length === 0) {
            // MOCK para desarrollo si la DB está vacía
            const MOCK_RESERVATIONS = [
                { id: "R001", guest_name: "Martín García", guest_phone: "+5491155557890", check_in: "2024-03-20", check_out: "2024-03-25", room_number: "Suite 301", adults: 2, children: 0, status: "confirmed", guest_tags: ["pareja"] },
                { id: "R002", guest_name: "Laura Pérez", guest_phone: "+5491144445678", check_in: "2024-03-21", check_out: "2024-03-24", room_number: "Doble 204", adults: 2, children: 2, status: "checked_in", guest_tags: ["familia"] },
            ];
            return res.json(MOCK_RESERVATIONS);
        }

        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error interno' });
    }
});

module.exports = router;
