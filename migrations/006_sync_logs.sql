-- Sprint 3: sync audit log + external_source en reservations
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS external_source TEXT;

CREATE TABLE IF NOT EXISTS integration_sync_logs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID,
  hotel_id       TEXT NOT NULL,
  synced_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source         TEXT,        -- 'ical', 'webhook', 'csv', 'api_polling'
  event_type     TEXT,        -- 'reservation.created', 'reservation.sync', etc.
  external_id    TEXT,
  action         TEXT,        -- 'created', 'updated', 'skipped', 'error'
  detail         JSONB
);

CREATE INDEX IF NOT EXISTS idx_sync_logs_hotel     ON integration_sync_logs(hotel_id, synced_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_logs_integration ON integration_sync_logs(integration_id, synced_at DESC);

-- Purgar logs > 90 días (ejecutar con cron mensual o pg_cron)
-- DELETE FROM integration_sync_logs WHERE synced_at < NOW() - INTERVAL '90 days';
