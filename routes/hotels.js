const express = require('express');
const { pool } = require('../database');
const auth = require('../middleware/auth');
const { createEvolutionInstance } = require('../services/whatsapp');
const crypto = require('crypto');

const router = express.Router();


router.get('/', auth(['super_admin']), async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM hotels ORDER BY created_at DESC');
        res.json(rows);
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
    let client;
    try {
        const {
            name, location, phone, email, whatsapp_number,
            plan, provider, evolution_url, evolution_apikey,
            upsell_prices
        } = req.body;

        console.log(`[1/5] Recibidos datos para hotel: ${name}`);

        if (!name) return res.status(400).json({ error: 'El nombre del hotel es requerido' });

        // Usar valores del request, o defaults de env vars si no vienen
        const evo_url = evolution_url || process.env.EVOLUTION_URL;
        const evo_key = evolution_apikey || process.env.EVOLUTION_API_KEY;
        // Por defecto, no auto-crear Evolution instance (puede ser conectado luego via API)
        const evo_provider = provider || 'mock';

        const settings = {
            plan,
            provider: evo_provider,
            evolution_url: evo_url,
            evolution_apikey: evo_key,
            upsell_prices: upsell_prices || {}
        };

        const hotelId = 'h_' + crypto.randomBytes(4).toString('hex');
        const instanceName = `stormguest-${hotelId}`;

        console.log(`[2/5] Generando ID: ${hotelId} e instancia: ${instanceName}`);

        client = await pool.connect();
        console.log(`[2.1/5] Conectado a base de datos`);

        await client.query('BEGIN');
        console.log(`[2.2/5] Transacción iniciada`);

        await client.query(
            `INSERT INTO hotels (id, name, location, phone, email, whatsapp_number, settings, active)
             VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
            [
                hotelId,
                name,
                location || null,
                phone || null,
                email || null,
                whatsapp_number || req.body.whatsapp || null,
                JSON.stringify(settings),
                true
            ]
        );
        console.log(`[3/5] Datos insertados en tabla 'hotels' (pendiente COMMIT)`);

        let qrCode = null;

        if (evo_provider === 'evolution' && evo_url && evo_key) {
            console.log(`[4/5] Intentando conectar con Evolution API en: ${evo_url}`);
            try {
                // Crear instancia en Evolution API
                const evoData = await createEvolutionInstance(instanceName, evo_url, evo_key);
                qrCode = evoData.qrCodeBase64;  // ← Imagen QR para mostrar en frontend

                // Guardar datos de Evolution en settings
                settings.evolution_instance = evoData.instanceName;
                settings.evolution_instance_id = evoData.instanceId;
                settings.evolution_hash = evoData.hash;
                settings.evolution_status = evoData.status;
                settings.qr_code = evoData.qrCodeBase64;  // ← Guardar QR code en DB
                settings.qr_code_text = evoData.qrCodeText;

                await client.query('UPDATE hotels SET settings = $1::jsonb WHERE id = $2', [JSON.stringify(settings), hotelId]);
                console.log(`[4.1/5] Instancia Evolution creada con éxito.`);
                console.log(`        → QR Code generado para escanear`);
            } catch (err) {
                console.error("[!] Error en Paso 4 (Evolution):", err.message);
                console.error("[!] Stack trace:", err.stack);
                // No revertimos el hotel, solo avisamos que no se pudo crear la instancia WhatsApp
                console.warn("[⚠️] El hotel fue creado pero sin integración WhatsApp (se puede conectar luego)");
                // El hotel se crea de todas formas, sin QR code por ahora
                qrCode = null;
            }
        } else {
            console.log(`[4/5] Saltando Evolution (Modo ${evo_provider})`);
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
