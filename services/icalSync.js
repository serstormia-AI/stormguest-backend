const cron = require('node-cron');
const axios = require('axios');
const ICAL = require('ical.js');
const { supabase } = require('./supabaseClient');

async function syncIcalIntegration(integration) {
  const { hotel_id, config, id } = integration;
  const { ical_url } = config;

  if (!ical_url) throw new Error('ical_url no configurada');

  const { data: text } = await axios.get(ical_url, { timeout: 15000, responseType: 'text' });

  const parsed = ICAL.parse(text);
  const comp = new ICAL.Component(parsed);
  const events = comp.getAllSubcomponents('vevent');

  let created = 0, updated = 0, errors = 0;

  for (const event of events) {
    try {
      const uid = event.getFirstPropertyValue('uid');
      if (!uid) continue;

      const summary = event.getFirstPropertyValue('summary') || 'Sin nombre';
      const dtstart = event.getFirstPropertyValue('dtstart');
      const dtend   = event.getFirstPropertyValue('dtend');

      if (!dtstart || !dtend) continue;

      const check_in  = dtstart.toJSDate().toISOString();
      const check_out = dtend.toJSDate().toISOString();

      // check if exists
      const { data: existing } = await supabase
        .from('reservations')
        .select('id')
        .eq('hotel_id', hotel_id)
        .eq('external_uid', uid)
        .maybeSingle();

      if (existing) {
        await supabase.from('reservations').update({ check_in, check_out, notes: summary })
          .eq('id', existing.id);
        updated++;
      } else {
        await supabase.from('reservations').insert({
          hotel_id,
          external_uid: uid,
          notes: summary,
          check_in,
          check_out,
          status: 'pending',
        });
        created++;
      }
    } catch {
      errors++;
    }
  }

  await supabase.from('hotel_integrations').update({
    last_sync: new Date().toISOString(),
    last_error: null,
  }).eq('id', id);

  console.log(`[ical] Hotel ${hotel_id}: +${created} creadas, ${updated} actualizadas, ${errors} errores`);
}

async function runAllIcalSyncs() {
  const { data: integrations, error } = await supabase
    .from('hotel_integrations')
    .select('*')
    .eq('type', 'ical')
    .eq('active', true);

  if (error || !integrations?.length) return;

  for (const integration of integrations) {
    try {
      await syncIcalIntegration(integration);
    } catch (err) {
      console.error(`[ical] Error en integración ${integration.id}:`, err.message);
      await supabase.from('hotel_integrations').update({ last_error: err.message }).eq('id', integration.id);
    }
  }
}

function startIcalCron() {
  // Cada hora
  cron.schedule('0 * * * *', runAllIcalSyncs);
  console.log('[ical] Cron de sincronización iCal activo (cada hora)');
}

module.exports = { startIcalCron, runAllIcalSyncs, syncIcalIntegration };
