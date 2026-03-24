/**
 * Test Route - SOLO PARA DESARROLLO
 * Endpoints para diagnosticar Evolution API y otros servicios
 */

const express = require('express');
const router = express.Router();
const axios = require('axios');

// ============================================================
// TEST EVOLUTION API CON DIFERENTES PARÁMETROS
// ============================================================

router.post('/evolution/create-instance', async (req, res) => {
    const {
        instanceName = `test-${Date.now()}`,
        testPhase = 1  // 1=minimal, 2=with-integration, 3=with-webhook, etc.
    } = req.body;

    const EVOLUTION_URL = process.env.EVOLUTION_URL;
    const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;

    if (!EVOLUTION_URL || !EVOLUTION_API_KEY) {
        return res.status(400).json({ error: 'Missing EVOLUTION_URL or EVOLUTION_API_KEY' });
    }

    // Preparar payload según la fase de test
    let payload = {};

    switch (testPhase) {
        case 1:
            // Mínimo: solo parámetros básicos
            payload = { instanceName, qrcode: true };
            break;
        case 2:
            // Con integration
            payload = {
                instanceName,
                qrcode: true,
                integration: "WHATSAPP-BAILEYS"
            };
            break;
        case 3:
            // Con webhook
            payload = {
                instanceName,
                qrcode: true,
                integration: "WHATSAPP-BAILEYS",
                webhook: process.env.WEBHOOK_URL
            };
            break;
        case 4:
            // Con webhook_events
            payload = {
                instanceName,
                qrcode: true,
                integration: "WHATSAPP-BAILEYS",
                webhook: process.env.WEBHOOK_URL,
                webhook_events: ["APPLICATION_STARTUP", "QRCODE_UPDATED", "MESSAGES_UPSERT"]
            };
            break;
        case 5:
            // Sin integration (pero con webhook)
            payload = {
                instanceName,
                qrcode: true,
                webhook: process.env.WEBHOOK_URL
            };
            break;
        case 6:
            // Intentar "BAILEYS" en lugar de "WHATSAPP-BAILEYS"
            payload = {
                instanceName,
                qrcode: true,
                integration: "BAILEYS"
            };
            break;
        default:
            return res.status(400).json({ error: `Unknown testPhase: ${testPhase}` });
    }

    try {
        console.log(`\n[🧪 Evolution API Test - Phase ${testPhase}]`);
        console.log(`   Endpoint: POST ${EVOLUTION_URL}/instance/create`);
        console.log(`   Payload:`, JSON.stringify(payload, null, 2));

        const response = await axios.post(
            `${EVOLUTION_URL}/instance/create`,
            payload,
            {
                headers: {
                    'apikey': EVOLUTION_API_KEY,
                    'Content-Type': 'application/json'
                },
                timeout: 15000,
                validateStatus: () => true  // No throw on any status
            }
        );

        console.log(`   Status: ${response.status}`);
        console.log(`   Response:`, JSON.stringify(response.data, null, 2));

        res.json({
            phase: testPhase,
            status: response.status,
            payload,
            response: response.data,
            success: response.status === 200 || response.status === 201
        });
    } catch (error) {
        console.error(`   Error: ${error.message}`);
        res.status(500).json({
            phase: testPhase,
            error: error.message,
            payload
        });
    }
});

// ============================================================
// GET HEALTH CHECK
// ============================================================

router.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        environment: process.env.NODE_ENV,
        evolution_url: process.env.EVOLUTION_URL,
        evolution_api_key: process.env.EVOLUTION_API_KEY ? '***' : 'NOT SET'
    });
});

module.exports = router;
