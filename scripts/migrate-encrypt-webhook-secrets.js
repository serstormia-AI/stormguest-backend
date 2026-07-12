/**
 * Migración de datos — Fase 2 encriptación PMS (one-shot, correr manualmente)
 *
 * Encripta los webhook_secret existentes que estén en texto plano en hotel_integrations.
 * Seguro para correr múltiples veces: detecta si ya está encriptado (objeto con iv/data/tag)
 * y lo omite.
 *
 * Prerequisito: ENCRYPTION_KEY debe estar configurada en el entorno antes de correr este script.
 *
 * Uso:
 *   ENCRYPTION_KEY=<hex-64-chars> node scripts/migrate-encrypt-webhook-secrets.js
 *
 * En Railway: correr como one-off command con las mismas env vars que el servidor.
 */

'use strict';

require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');
const { encryptField }  = require('../services/crypto');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

async function run() {
  if (!process.env.ENCRYPTION_KEY) {
    console.error('ERROR: ENCRYPTION_KEY no está configurada. Abortando.');
    process.exit(1);
  }

  const { data: rows, error } = await supabase
    .from('hotel_integrations')
    .select('id, hotel_id, config')
    .eq('type', 'webhook');

  if (error) {
    console.error('Error al leer hotel_integrations:', error.message);
    process.exit(1);
  }

  if (!rows?.length) {
    console.log('No hay integraciones de tipo webhook. Nada que migrar.');
    return;
  }

  let migrated = 0;
  let skipped  = 0;
  let errors   = 0;

  for (const row of rows) {
    const secret = row.config?.webhook_secret;

    if (!secret) {
      // Sin secret configurado — nada que hacer
      skipped++;
      continue;
    }

    if (typeof secret === 'object' && secret.iv && secret.data && secret.tag) {
      // Ya encriptado — idempotente
      skipped++;
      continue;
    }

    if (typeof secret !== 'string') {
      console.warn(`[${row.id}] webhook_secret tiene formato inesperado:`, typeof secret);
      skipped++;
      continue;
    }

    const encrypted = encryptField(secret);
    if (!encrypted) {
      console.error(`[${row.id}] encryptField falló para hotel ${row.hotel_id}`);
      errors++;
      continue;
    }

    const { error: updateErr } = await supabase
      .from('hotel_integrations')
      .update({ config: { ...row.config, webhook_secret: encrypted } })
      .eq('id', row.id);

    if (updateErr) {
      console.error(`[${row.id}] Error al actualizar:`, updateErr.message);
      errors++;
    } else {
      console.log(`[${row.id}] hotel ${row.hotel_id} — webhook_secret encriptado OK`);
      migrated++;
    }
  }

  console.log(`\nResultado: ${migrated} migrados, ${skipped} omitidos, ${errors} errores`);
  if (errors > 0) process.exit(1);
}

run().catch(err => {
  console.error('Error inesperado:', err);
  process.exit(1);
});
