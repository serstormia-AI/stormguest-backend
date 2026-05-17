ALTER TABLE hotels ADD COLUMN IF NOT EXISTS stripe_secret_key_enc JSONB;
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS stripe_publishable_key TEXT;
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS stripe_webhook_secret_enc JSONB;
