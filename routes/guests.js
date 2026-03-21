const express = require('express');
const { pool } = require('../database');
const auth = require('../middleware/auth');

const router = express.Router();

router.get('/', auth(), async (req, res) => {
    try {
        const hotelId = req.user.hotel_id;
        if (!hotelId && req.user.role !== 'super_admin') return res.status(400).json({ error: 'hotel_id no asociado al usuario' });

        // Mock response for quick dev setup
        const MOCK_GUESTS = [
            { id: 1, name: "María González", phone: "+5491144445555", status: "checking_in", tags: ["vip", "early_checkin"], last_contact: "hace 5 min", unread: 2 },
            { id: 2, name: "John Smith", phone: "+13054445555", status: "during_stay", tags: ["extranjero"], last_contact: "hace 2 horas", unread: 0 },
            { id: 3, name: "Familia Rossi", phone: "+5493512223333", status: "checkout", tags: ["familia", "late_checkout"], last_contact: "hace 1 día", unread: 0 },
        ];

        res.json(MOCK_GUESTS);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error interno' });
    }
});

module.exports = router;
