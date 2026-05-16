// Required env vars: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, FRONTEND_URL
const express = require('express');
const { pool } = require('../database');
const auth = require('../middleware/auth');

const router = express.Router();

function getStripe() {
    if (!process.env.STRIPE_SECRET_KEY) return null;
    return require('stripe')(process.env.STRIPE_SECRET_KEY);
}

// POST /api/payments/checkout
router.post('/checkout', async (req, res) => {
    const stripe = getStripe();
    if (!stripe) return res.status(503).json({ error: 'Pagos no configurados' });

    const { service_id, guest_name, guest_email, hotel_id } = req.body;

    if (!service_id || !guest_name || !guest_email || !hotel_id) {
        return res.status(400).json({ error: 'Faltan campos requeridos' });
    }

    try {
        const { rows } = await pool.query(
            'SELECT * FROM services WHERE id = $1 AND hotel_id = $2 AND active = true',
            [service_id, hotel_id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Servicio no encontrado' });
        }

        const service = rows[0];
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

        const { rows: orderRows } = await pool.query(
            `INSERT INTO orders (hotel_id, guest_name, guest_email, service_id, service_name, amount, currency, status)
             VALUES ($1, $2, $3, $4, $5, $6, 'usd', 'pending') RETURNING id`,
            [hotel_id, guest_name, guest_email, service_id, service.name, service.price]
        );

        const orderId = orderRows[0].id;

        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            line_items: [
                {
                    price_data: {
                        currency: 'usd',
                        product_data: { name: service.name },
                        unit_amount: Math.round(Number(service.price) * 100),
                    },
                    quantity: 1,
                },
            ],
            customer_email: guest_email,
            success_url: `${frontendUrl}/orders?session_id={CHECKOUT_SESSION_ID}&status=success`,
            cancel_url: `${frontendUrl}/catalog?status=cancelled`,
            metadata: { service_id, hotel_id, order_id: orderId, guest_name },
        });

        await pool.query(
            'UPDATE orders SET stripe_session_id = $1 WHERE id = $2',
            [session.id, orderId]
        );

        return res.json({ url: session.url });
    } catch (err) {
        console.error('[payments POST /checkout] Error:', err.message);
        return res.status(500).json({ error: 'Error al crear sesión de pago' });
    }
});

// POST /api/payments/webhook — debe montarse ANTES de express.json()
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const stripe = getStripe();
    if (!stripe) return res.sendStatus(200);

    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
        console.error('[payments webhook] STRIPE_WEBHOOK_SECRET no configurado');
        return res.sendStatus(200);
    }

    let event;
    try {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
        console.error('[payments webhook] Firma inválida:', err.message);
        return res.status(400).json({ error: `Webhook Error: ${err.message}` });
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        try {
            await pool.query(
                "UPDATE orders SET status = 'paid' WHERE stripe_session_id = $1",
                [session.id]
            );
        } catch (err) {
            console.error('[payments webhook] Error actualizando orden:', err.message);
        }
    }

    return res.sendStatus(200);
});

// GET /api/payments/orders
router.get('/orders', auth(), async (req, res) => {
    try {
        const hotel_id = req.user.hotel_id;
        const { rows } = await pool.query(
            'SELECT * FROM orders WHERE hotel_id = $1 ORDER BY created_at DESC',
            [hotel_id]
        );
        return res.json(rows);
    } catch (err) {
        console.error('[payments GET /orders] Error:', err.message);
        return res.status(500).json({ error: 'Database error', detail: err.message });
    }
});

module.exports = router;
