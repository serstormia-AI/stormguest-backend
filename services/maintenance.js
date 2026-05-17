const cron = require('node-cron');
const { supabase } = require('./supabaseClient');

async function purgeOldSyncLogs() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);

  const { error, count } = await supabase
    .from('integration_sync_logs')
    .delete({ count: 'exact' })
    .lt('synced_at', cutoff.toISOString());

  if (error) {
    console.error('[maintenance] Error purgando sync logs:', error.message);
  } else {
    console.log(`[maintenance] Purgados ${count || 0} sync logs anteriores a ${cutoff.toISOString().slice(0, 10)}`);
  }
}

function startMaintenanceCron() {
  // Día 1 de cada mes a las 3am
  cron.schedule('0 3 1 * *', purgeOldSyncLogs);
  console.log('[maintenance] Cron de purga de logs activo (mensual)');
}

module.exports = { startMaintenanceCron, purgeOldSyncLogs };
