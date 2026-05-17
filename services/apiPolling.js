const cron = require('node-cron');
const { supabase }  = require('./supabaseClient');
const { decryptField } = require('./crypto');
const { CloudbedsClient, normalizeReservation: normalizeClb } = require('./pms-clients/cloudbeds');
const { ApaleoClient,    normalizeReservation: normalizeApl } = require('./pms-clients/apaleo');

// Ventana de polling: reservas de los últimos 30 días + próximos 90
function getDateRange() {
  const from = new Date(); from.setDate(from.getDate() - 30);
  const to   = new Date(); to.setDate(to.getDate() + 90);
  return {
    from: from.toISOString().slice(0, 10),
    to:   to.toISOString().slice(0, 10),
  };
}

async function getClient(integration) {
  const { provider, config } = integration;

  if (provider === 'cloudbeds') {
    const api_key     = decryptField(config.api_key_enc) || config.api_key;
    const property_id = config.property_id;
    if (!api_key) throw new Error('Cloudbeds: api_key no configurada');
    return { client: new CloudbedsClient({ api_key, property_id }), normalize: normalizeClb };
  }

  if (provider === 'apaleo') {
    const client_id     = decryptField(config.client_id_enc)     || config.client_id;
    const client_secret = decryptField(config.client_secret_enc) || config.client_secret;
    const property_id   = config.property_id;
    if (!client_id || !client_secret) throw new Error('Apaleo: credenciales no configuradas');
    return { client: new ApaleoClient({ client_id, client_secret, property_id }), normalize: normalizeApl };
  }

  throw new Error(`Provider '${provider}' no soportado para polling`);
}

async function upsertReservation(hotel_id, norm) {
  const { external_uid, external_source, guest_name, guest_email, guest_phone, status, ...rest } = norm;

  // Upsert guest
  let guest_id = null;
  if (guest_email || guest_phone) {
    const col = guest_email ? 'email' : 'phone';
    const val = guest_email || guest_phone;
    const { data: g } = await supabase.from('guests').select('id').eq('hotel_id', hotel_id).eq(col, val).maybeSingle();
    if (g) {
      guest_id = g.id;
    } else if (guest_name) {
      const { data: ng } = await supabase.from('guests')
        .insert({ hotel_id, name: guest_name, email: guest_email || null, phone: guest_phone || null })
        .select('id').single();
      if (ng) guest_id = ng.id;
    }
  }

  const { data: existing } = await supabase.from('reservations')
    .select('id, status').eq('hotel_id', hotel_id).eq('external_uid', external_uid).maybeSingle();

  const payload = { hotel_id, guest_id, external_uid, status, ...rest };

  let action;
  if (existing) {
    if (existing.status === status && existing.check_in === rest.check_in) {
      return 'skipped';
    }
    await supabase.from('reservations').update(payload).eq('id', existing.id);
    action = 'updated';
  } else {
    await supabase.from('reservations').insert(payload);
    action = 'created';
  }
  return action;
}

async function pollIntegration(integration) {
  const { id, hotel_id } = integration;
  const { client, normalize } = await getClient(integration);
  const { from, to } = getDateRange();

  const remoteList = await client.getAllReservations({ from, to });

  let created = 0, updated = 0, skipped = 0, errors = 0;

  for (const remote of remoteList) {
    try {
      const norm   = normalize(remote);
      const action = await upsertReservation(hotel_id, norm);
      if (action === 'created') created++;
      else if (action === 'updated') updated++;
      else skipped++;

      // Sync log
      await supabase.from('integration_sync_logs').insert({
        integration_id: id,
        hotel_id,
        source:      integration.type,
        event_type:  'reservation.sync',
        external_id: norm.external_uid,
        action,
      });
    } catch (err) {
      errors++;
      await supabase.from('integration_sync_logs').insert({
        integration_id: id,
        hotel_id,
        source:  integration.type,
        action:  'error',
        detail:  { error: err.message },
      });
    }
  }

  await supabase.from('hotel_integrations').update({
    last_sync:  new Date().toISOString(),
    last_error: null,
    updated_at: new Date().toISOString(),
  }).eq('id', id);

  console.log(`[polling] ${integration.provider} hotel ${hotel_id}: +${created} creadas, ${updated} actualizadas, ${skipped} iguales, ${errors} errores`);
}

async function runAllPolling() {
  const { data: integrations } = await supabase
    .from('hotel_integrations')
    .select('*')
    .eq('type', 'api_polling')
    .eq('active', true);

  if (!integrations?.length) return;

  for (const integration of integrations) {
    try {
      await pollIntegration(integration);
    } catch (err) {
      console.error(`[polling] Error en ${integration.id}:`, err.message);
      await supabase.from('hotel_integrations')
        .update({ last_error: err.message }).eq('id', integration.id);
    }
  }
}

function startPollingCron() {
  // Cada 15 minutos
  cron.schedule('*/15 * * * *', runAllPolling);
  console.log('[polling] Cron de API polling activo (cada 15 min)');
}

module.exports = { startPollingCron, runAllPolling, pollIntegration };
