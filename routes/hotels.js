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
    console.log('--- NUEVA PETICIÓN: CREACIÓN DE HOTEL ---');
    const client = await pool.connect();
    try {
        const { 
            name, location, phone, email, whatsapp_number, 
            plan, provider, evolution_url, evolution_apikey, 
            upsell_prices 
        } = req.body;

        console.log(`[1/5] Recibidos datos para hotel: ${name}`);

        if (!name) return res.status(400).json({ error: 'El nombre del hotel es requerido' });

        const settings = {
            plan,
            provider,
            evolution_url,
            evolution_apikey,
            upsell_prices: upsell_prices || {}
        };

        const hotelId = 'h_' + crypto.randomBytes(4).toString('hex');
        const instanceName = `stormguest-${hotelId}`;

        console.log(`[2/5] Generando ID: ${hotelId} e instancia: ${instanceName}`);

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
        console.log(`[3/5] Datos insertados en tabla 'hotels' (pendiente COMMIT)`);

        let qrCode = null;

        if (provider === 'evolution' && evolution_url && evolution_apikey) {
            console.log(`[4/5] Intentando conectar con Evolution API en: ${evolution_url}`);
            try {
                // Añadimos un pequeño timeout interno de 15s para no colgar el request
                const evoData = await createEvolutionInstance(instanceName, evolution_url, evolution_apikey);
                qrCode = evoData.qr;
                
                settings.evolution_instance = evoData.instanceName;
                await client.query('UPDATE hotels SET settings = $1 WHERE id = $2', [settings, hotelId]);
                console.log(`[4.1/5] Instancia Evolution creada con éxito.`);
            } catch (err) {
                console.error("[!] Error en Paso 4 (Evolution):", err.message);
                // No revertimos el hotel, solo avisamos
            }
        } else {
            console.log(`[4/5] Saltando Evolution (Modo ${provider || 'mock'})`);
        }

        await client.query('COMMIT');
        console.log(`[5/5] Transacción completada con éxito. Enviando respuesta.`);

        res.status(201).json({
            message: 'Hotel creado correctamente.',
            hotel_id: hotelId,
            qr_code: qrCode
        });

    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error('❌ ERROR FATAL AL CREAR HOTEL:', error);
        res.status(500).json({ 
            error: 'Error interno al crear el hotel', 
            details: error.message 
        });
    } finally {
        if (client) client.release();
    }
});

module.exports = router;
