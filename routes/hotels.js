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

// Obtener QR code en HTML (SIN autenticación) - siempre fresco desde Evolution API
router.get('/:id/qr', async (req, res) => {
    try {
        const { id } = req.params;
        const { rows } = await pool.query('SELECT name, settings FROM hotels WHERE id = $1', [id]);

        if (rows.length === 0) {
            return res.status(404).send('<h1>Hotel no encontrado</h1>');
        }

        const hotel = rows[0];
        const settings = hotel.settings || {};
        const instance = settings.evolution_instance;

        let qrBase64 = null;
        let statusMsg = '';
        let isConnected = false;

        if (instance) {
            try {
                const evoUrl = settings.evolution_url || process.env.EVOLUTION_URL;
                const evoKey = settings.evolution_apikey || process.env.EVOLUTION_API_KEY;
                const axios = require('axios');

                // Siempre pedir QR fresco a Evolution API
                const evoRes = await axios.get(`${evoUrl}/instance/connect/${instance}`, {
                    headers: { 'apikey': evoKey },
                    timeout: 10000
                });

                const data = evoRes.data;

                if (data?.base64) {
                    qrBase64 = data.base64;
                } else if (data?.qrcode?.base64) {
                    qrBase64 = data.qrcode.base64;
                } else if (data?.instance?.state === 'open' || data?.state === 'open') {
                    isConnected = true;
                    statusMsg = '✅ WhatsApp conectado correctamente';
                }
            } catch (evoErr) {
                console.error('Error obteniendo QR de Evolution:', evoErr.message);
                statusMsg = 'Error conectando con Evolution API';
            }
        } else {
            statusMsg = 'No hay instancia WhatsApp configurada para este hotel';
        }

        if (isConnected) {
            return res.send(`
                <!DOCTYPE html><html>
                <head><title>WhatsApp - ${hotel.name}</title>
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <style>body{font-family:Arial;text-align:center;padding:40px;background:#f5f5f5}
                .card{background:white;border-radius:12px;padding:30px;display:inline-block;box-shadow:0 2px 12px rgba(0,0,0,.1)}
                h2{color:#1a1a2e}.status{font-size:1.2em;color:#25d366;margin:20px 0}</style></head>
                <body><div class="card">
                <h2>🏨 ${hotel.name}</h2>
                <p class="status">${statusMsg}</p>
                <p><small>Hotel ID: ${id}</small></p>
                </div></body></html>
            `);
        }

        if (!qrBase64) {
            return res.send(`
                <!DOCTYPE html><html>
                <head><title>QR - ${hotel.name}</title>
                <meta http-equiv="refresh" content="10">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <style>body{font-family:Arial;text-align:center;padding:40px;background:#f5f5f5}
                .card{background:white;border-radius:12px;padding:30px;display:inline-block;box-shadow:0 2px 12px rgba(0,0,0,.1)}</style></head>
                <body><div class="card">
                <h2>🏨 ${hotel.name}</h2>
                <p>⚠️ ${statusMsg || 'QR no disponible'}</p>
                <p><small>Instance: ${instance || 'no configurada'}</small></p>
                <p><small>Refrescando en 10 segundos...</small></p>
                </div></body></html>
            `);
        }

        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>QR - ${hotel.name}</title>
                <meta http-equiv="refresh" content="20">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <style>
                    body { font-family: Arial; text-align: center; padding: 20px; background: #f5f5f5; }
                    .card { background: white; border-radius: 12px; padding: 30px; display: inline-block; box-shadow: 0 2px 12px rgba(0,0,0,0.1); }
                    img { max-width: 320px; width: 100%; }
                    h2 { color: #1a1a2e; margin-bottom: 8px; }
                    p { color: #666; margin: 8px 0; }
                    .timer { font-size: 0.8em; color: #999; }
                </style>
            </head>
            <body>
                <div class="card">
                    <h2>🏨 ${hotel.name}</h2>
                    <p>Escanea con WhatsApp para conectar</p>
                    <img src="${qrBase64}" alt="QR Code WhatsApp">
                    <p><small>Hotel ID: ${id}</small></p>
                    <p class="timer">⏱ QR se renueva automáticamente cada 20 segundos</p>
                </div>
            </body>
            </html>
        `);
    } catch (error) {
        console.error('Error en /qr:', error);
        res.status(500).send(`<h1>Error: ${error.message}</h1>`);
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
            return res.status(404).json({ error: 'Hotel no encontrado' });
        }
        return res.json(rows[0]);
    } catch (err) {
        console.error('[hotels GET /:id] Error:', err.message);
        return res.status(500).json({ error: 'Database error', detail: err.message });
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

        // Fix 4: Input validation
        if (!name || typeof name !== 'string' || name.trim() === '') {
            return res.status(400).json({ error: 'El campo name es requerido y debe ser texto' });
        }
        if (email !== undefined && email !== null && (typeof email !== 'string' || !email.includes('@'))) {
            return res.status(400).json({ error: 'El campo email no tiene un formato válido' });
        }
        if (phone !== undefined && phone !== null && typeof phone !== 'string') {
            return res.status(400).json({ error: 'El campo phone debe ser texto' });
        }

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
