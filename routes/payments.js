// Required env vars: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, FRONTEND_URL
const express = require('express');
const { supabase } = require('../services/supabaseClient');
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
        const { data: service, error: serviceError } = await supabase
            .from('services')
            .select('*')
            .eq('id', service_id)
            .eq('hotel_id', hotel_id)
            .eq('active', true)
            .single();

        if (serviceError || !service) {
            return res.status(404).json({ error: 'Servicio no encontrado' });
        }

        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

        const { data: order, error: orderError } = await supabase
            .from('orders')
            .insert({
                hotel_id,
                guest_name,
                guest_email,
                service_id,
                service_name: service.name,
                amount: service.price,
                currency: 'usd',
                status: 'pending'
            })
            .select('id')
            .single();

        if (orderError) return res.status(500).json({ error: orderError.message });

        const orderId = order.id;

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

        const { error: updateError } = await supabase
            .from('orders')
            .update({ stripe_session_id: session.id })
            .eq('id', orderId);

        if (updateError) console.error('[payments POST /checkout] Error guardando session_id:', updateError.message);

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
        const { error } = await supabase
            .from('orders')
            .update({ status: 'paid' })
            .eq('stripe_session_id', session.id);

        if (error) console.error('[payments webhook] Error actualizando orden:', error.message);
    }

    return res.sendStatus(200);
});

// GET /api/payments/orders
router.get('/orders', auth(), async (req, res) => {
    try {
        const hotel_id = req.user.hotel_id;

        const { data, error } = await supabase
            .from('orders')
            .select('*')
            .eq('hotel_id', hotel_id)
            .order('created_at', { ascending: false });

        if (error) return res.status(500).json({ error: error.message });

        return res.json(data);
    } catch (err) {
        console.error('[payments GET /orders] Error:', err.message);
        return res.status(500).json({ error: 'Database error', detail: err.message });
    }
});

module.exports = router;
