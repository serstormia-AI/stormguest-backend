require('dotenv').config();
const axios = require('axios');

async function createEvolutionInstance(instanceName, evolutionUrl, globalApiKey) {
    if (!evolutionUrl || !globalApiKey) throw new Error('Evolution API URL and Global API Key required');
    
    try {
        const response = await axios.post(`${evolutionUrl}/instance/create`, {
            instanceName,
            qrcode: true,
            integration: "WHATSAPP-BAILEYS",
            webhook: process.env.WEBHOOK_URL || "https://api.serstormia.cloud/webhook/evolution",
            webhook_events: ["APPLICATION_STARTUP", "QRCODE_UPDATED", "MESSAGES_UPSERT", "SEND_MESSAGE", "CONNECTION_UPDATE"]
        }, {
            headers: { 'apikey': globalApiKey, 'Content-Type': 'application/json' },
            timeout: 15000 // 15 segundos de timeout
        });

        return {
            instanceName: response.data.instance?.instanceName || instanceName,
            hash: response.data.hash,
            qr: response.data.qrcode?.base64
        };
    } catch (error) {
        console.error('Error creating Evolution instance:', error.response?.data || error.message);
        throw new Error('Failed to create WhatsApp instance in Evolution');
    }
}

const PROVIDER = process.env.WHATSAPP_PROVIDER || 'mock';

// ============================================================
// VERIFY WEBHOOK (Meta Business API)
// ============================================================
function verifyWebhook(req, res) {
    if (PROVIDER === 'meta') {
        const mode = req.query['hub.mode'];
        const token = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];
        if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
            return res.status(200).send(challenge);
        }
    }
    // Evolution API no requiere verificación por challenge en setup básico, solo recibe POST
    return res.status(200).send('OK');
}

// ============================================================
// PARSEAR MENSAJE ENTRANTE
// ============================================================
function parseIncomingMessage(body) {
    if (!body) return null;

    try {
        if (PROVIDER === 'meta' || PROVIDER === 'mock') {
            // ... (keeping existing meta logic)
            const entry = body.entry?.[0];
            const changes = entry?.changes?.[0];
            const value = changes?.value;
            const message = value?.messages?.[0];
            if (!message) return null;
            const from = message.from;
            const to = value.metadata?.display_phone_number || value.metadata?.phone_number_id;
            const name = value.contacts?.[0]?.profile?.name || 'Huésped';
            const messageId = message.id;
            let content = '';
            let mediaUrl = null;
            let mediaType = message.type;
            if (message.type === 'text') content = message.text.body;
            else if (message.type === 'audio') mediaUrl = message.audio.id;
            else if (message.type === 'image') mediaUrl = message.image.id;
            return { from, to, name, content, mediaUrl, mediaType, messageId };
        }

        if (PROVIDER === 'evolution') {
            // Formato Evolution API v2
            if (body.event !== 'messages.upsert') return null;
            const data = body.data;
            if (data.key.fromMe) return null; // Ignorar mis propios mensajes enviados

            const from = data.key.remoteJid.split('@')[0];
            const to = body.instance; // O el número asociado a la instancia
            const name = body.pushName || 'Huésped';
            const messageId = data.key.id;
            const content = data.message?.conversation || data.message?.extendedTextMessage?.text || '';
            const mediaType = data.messageType || 'text';
            
            return { from, to, name, content, mediaUrl: null, mediaType, messageId };
        }
    } catch (err) {
        console.error('Error parseando webhook:', err);
        return null;
    }
}

// ============================================================
// ENVIAR MENSAJE
// ============================================================
async function sendMessage(to, text, token) {
    console.log(`\n===========================================`);
    console.log(`📤 OUTGOING MESSAGE TO: ${to}`);
    console.log(`📝 CONTENT: ${text}`);
    console.log(`===========================================\n`);

    if (PROVIDER === 'mock') {
        return { success: true, mock: true };
    }

    if (PROVIDER === 'meta') {
        return { success: true };
    }

    if (PROVIDER === 'evolution') {
        try {
            const instance = process.env.EVOLUTION_INSTANCE; // Assuming a default instance for sending
            await evolutionService.sendMessage(to, text, instance);
            return { success: true };
        } catch (error) {
            console.error('Error enviando mensaje via Evolution:', error.response?.data || error.message);
            return { success: false, error: error.message };
        }
    }
}

// ============================================================
// DESCARGAR MEDIA (Audios)
// ============================================================
async function downloadMedia(mediaId, token) {
    if (PROVIDER === 'mock') return null; // No hay media real en mock

    if (PROVIDER === 'meta') {
        // 1. Obtener URL del media
        // 2. Descargar buffer
        console.log('Simulando descarga de Meta Media ID:', mediaId);
        return Buffer.from('mock audio buffer');
    }

    if (PROVIDER === 'twilio') {
        // URL directa en twilio
        return Buffer.from('mock audio buffer');
    }
}

module.exports = {
    verifyWebhook,
    parseIncomingMessage,
    sendMessage,
    downloadMedia,
    createEvolutionInstance
};
