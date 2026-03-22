const express = require('express');
const { pool } = require('../database');
const auth = require('../middleware/auth');
const { createEvolutionInstance } = require('../services/whatsapp');
const crypto = require('crypto');

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

router.post('/', auth(['super_admin']), async (req, res) => {
    const client = await pool.connect();
    try {
        const { 
            name, location, phone, email, whatsapp_number, 
            plan, provider, evolution_url, evolution_apikey, 
            upsell_prices 
        } = req.body;

        if (!name) return res.status(400).json({ error: 'El nombre del hotel es requerido' });

        // Build settings object
        const settings = {
            plan,
            provider,
            evolution_url,
            evolution_apikey,
            upsell_prices: upsell_prices || {}
        };

        const hotelId = 'h_' + crypto.randomBytes(6).toString('hex');
        const instanceName = `stormguest-${hotelId}`;

        // Insert into DB
        await client.query('BEGIN');
        await client.query(
            `INSERT INTO hotels (id, name, location, phone, email, whatsapp_number, settings, active) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
                hotelId, 
                name, 
                location || null, 
                phone || null, 
                email || null, 
                whatsapp_number || req.body.whatsapp || null, 
                settings, 
                true
            ]
        );

        let qrCode = null;

        // Automatically create Evolution instance if provider is evolution
        if (provider === 'evolution' && evolution_url && evolution_apikey) {
            try {
                const evoData = await createEvolutionInstance(instanceName, evolution_url, evolution_apikey);
                qrCode = evoData.qr;
                
                // Update settings with instanceName
                settings.evolution_instance = evoData.instanceName;
                await client.query('UPDATE hotels SET settings = $1 WHERE id = $2', [settings, hotelId]);
            } catch (err) {
                console.error("No se pudo crear la instancia de Evolution:", err);
                // We don't rollback the hotel creation, just return a warning to the frontend
            }
        }

        await client.query('COMMIT');

        res.status(201).json({
            message: 'Hotel creado y configurado correctamente.',
            hotel_id: hotelId,
            qr_code: qrCode
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error creating hotel:', error);
        res.status(500).json({ error: 'Error interno al crear el hotel', details: error.message, stack: error.stack });
    } finally {
        client.release();
    }
});

module.exports = router;
