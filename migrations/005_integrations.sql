-- Sprint 1: PMS integrations
CREATE TABLE IF NOT EXISTS hotel_integrations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id    TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('csv', 'ical', 'webhook', 'api')),
  provider    TEXT,                         -- 'cloudbeds', 'apaleo', 'beds24', etc.
  active      BOOLEAN NOT NULL DEFAULT true,
  config      JSONB NOT NULL DEFAULT '{}',  -- ical_url, webhook_secret, api_key, etc.
  last_sync   TIMESTAMPTZ,
  last_error  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hotel_integrations_hotel ON hotel_integrations(hotel_id);
CREATE INDEX IF NOT EXISTS idx_hotel_integrations_type  ON hotel_integrations(hotel_id, type);

-- Para upsert sin duplicados en iCal y webhooks
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS external_uid TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_reservations_external_uid ON reservations(hotel_id, external_uid) WHERE external_uid IS NOT NULL;
