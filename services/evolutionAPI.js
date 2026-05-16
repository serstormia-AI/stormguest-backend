// Required env vars:
// EVOLUTION_API_KEY   — API key de Evolution API
// EVOLUTION_API_URL   — Base URL (ej: https://your-evolution.railway.app)
// EVOLUTION_INSTANCE  — Nombre de la instancia (default: 'stormguest')

const axios = require('axios');

const BASE_URL = process.env.EVOLUTION_API_URL || 'https://api.evolution-api.com';
const INSTANCE = process.env.EVOLUTION_INSTANCE || 'stormguest';
const API_KEY = process.env.EVOLUTION_API_KEY;

const client = axios.create({
  baseURL: BASE_URL,
  headers: {
    apikey: API_KEY,
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

async function sendWhatsAppMessage(phone, text) {
  const url = `/message/sendText/${INSTANCE}`;
  const body = {
    number: phone,
    text,
  };
  const response = await client.post(url, body);
  return response.data;
}

async function getInstances() {
  const response = await client.get('/instance/fetchInstances');
  return response.data;
}

module.exports = { sendWhatsAppMessage, getInstances };
