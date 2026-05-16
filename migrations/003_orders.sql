CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id TEXT,
  guest_name TEXT,
  guest_email TEXT,
  service_id UUID,
  service_name TEXT,
  amount NUMERIC(10,2),
  currency TEXT DEFAULT 'usd',
  stripe_session_id TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_orders_hotel_id ON orders(hotel_id);
