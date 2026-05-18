-- =============================================================================
-- StormGuest -- Migration 008: RLS basado en app.hotel_id (backend JWT propio)
-- Compatible: PostgreSQL 14+ / Supabase
--
-- IMPORTANTE: Ejecutar como superuser desde Supabase SQL Editor.
-- El service_role key bypasea RLS -- el backend debe usar ANON KEY para
-- queries de usuarios finales.
--
-- Las politicas usan hotel_id::text = app_hotel_id() para compatibilidad
-- con columnas UUID y TEXT por igual.
-- =============================================================================

-- Eliminar version anterior si existe (puede tener RETURNS uuid o text)
DROP FUNCTION IF EXISTS app_hotel_id();

-- Helper: lee la variable de sesion seteada por el backend Express
CREATE OR REPLACE FUNCTION app_hotel_id()
RETURNS text AS $$
  SELECT current_setting('app.hotel_id', true);
$$ LANGUAGE sql STABLE SECURITY DEFINER;


-- =============================================================================
-- TABLE: hotels
-- =============================================================================

ALTER TABLE hotels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hotels_select_v2  ON hotels;
DROP POLICY IF EXISTS hotels_insert_v2  ON hotels;
DROP POLICY IF EXISTS hotels_update_v2  ON hotels;
DROP POLICY IF EXISTS hotels_delete_v2  ON hotels;
DROP POLICY IF EXISTS hotels_select     ON hotels;
DROP POLICY IF EXISTS hotels_insert     ON hotels;
DROP POLICY IF EXISTS hotels_update     ON hotels;
DROP POLICY IF EXISTS hotels_delete     ON hotels;

CREATE POLICY hotels_select_v2 ON hotels FOR SELECT
  USING (id::text = app_hotel_id());

CREATE POLICY hotels_insert_v2 ON hotels FOR INSERT
  WITH CHECK (id::text = app_hotel_id());

CREATE POLICY hotels_update_v2 ON hotels FOR UPDATE
  USING (id::text = app_hotel_id())
  WITH CHECK (id::text = app_hotel_id());

CREATE POLICY hotels_delete_v2 ON hotels FOR DELETE
  USING (id::text = app_hotel_id());


-- =============================================================================
-- TABLE: users
-- =============================================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_select_v2  ON users;
DROP POLICY IF EXISTS users_insert_v2  ON users;
DROP POLICY IF EXISTS users_update_v2  ON users;
DROP POLICY IF EXISTS users_delete_v2  ON users;

CREATE POLICY users_select_v2 ON users FOR SELECT
  USING (hotel_id::text = app_hotel_id());

CREATE POLICY users_insert_v2 ON users FOR INSERT
  WITH CHECK (hotel_id::text = app_hotel_id());

CREATE POLICY users_update_v2 ON users FOR UPDATE
  USING (hotel_id::text = app_hotel_id())
  WITH CHECK (hotel_id::text = app_hotel_id());

CREATE POLICY users_delete_v2 ON users FOR DELETE
  USING (hotel_id::text = app_hotel_id());


-- =============================================================================
-- TABLE: guests
-- =============================================================================

ALTER TABLE guests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS guests_select_v2   ON guests;
DROP POLICY IF EXISTS guests_insert_v2   ON guests;
DROP POLICY IF EXISTS guests_update_v2   ON guests;
DROP POLICY IF EXISTS guests_delete_v2   ON guests;
DROP POLICY IF EXISTS guests_select      ON guests;
DROP POLICY IF EXISTS guests_select_own  ON guests;
DROP POLICY IF EXISTS guests_insert      ON guests;
DROP POLICY IF EXISTS guests_update      ON guests;
DROP POLICY IF EXISTS guests_delete      ON guests;

CREATE POLICY guests_select_v2 ON guests FOR SELECT
  USING (hotel_id::text = app_hotel_id());

CREATE POLICY guests_insert_v2 ON guests FOR INSERT
  WITH CHECK (hotel_id::text = app_hotel_id());

CREATE POLICY guests_update_v2 ON guests FOR UPDATE
  USING (hotel_id::text = app_hotel_id())
  WITH CHECK (hotel_id::text = app_hotel_id());

CREATE POLICY guests_delete_v2 ON guests FOR DELETE
  USING (hotel_id::text = app_hotel_id());


-- =============================================================================
-- TABLE: reservations
-- =============================================================================

ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reservations_select_v2  ON reservations;
DROP POLICY IF EXISTS reservations_insert_v2  ON reservations;
DROP POLICY IF EXISTS reservations_update_v2  ON reservations;
DROP POLICY IF EXISTS reservations_delete_v2  ON reservations;
DROP POLICY IF EXISTS reservations_select     ON reservations;
DROP POLICY IF EXISTS reservations_insert     ON reservations;
DROP POLICY IF EXISTS reservations_update     ON reservations;
DROP POLICY IF EXISTS reservations_delete     ON reservations;

CREATE POLICY reservations_select_v2 ON reservations FOR SELECT
  USING (hotel_id::text = app_hotel_id());

CREATE POLICY reservations_insert_v2 ON reservations FOR INSERT
  WITH CHECK (hotel_id::text = app_hotel_id());

CREATE POLICY reservations_update_v2 ON reservations FOR UPDATE
  USING (hotel_id::text = app_hotel_id())
  WITH CHECK (hotel_id::text = app_hotel_id());

CREATE POLICY reservations_delete_v2 ON reservations FOR DELETE
  USING (hotel_id::text = app_hotel_id());


-- =============================================================================
-- TABLE: conversations
-- =============================================================================

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conversations_select_v2  ON conversations;
DROP POLICY IF EXISTS conversations_insert_v2  ON conversations;
DROP POLICY IF EXISTS conversations_update_v2  ON conversations;
DROP POLICY IF EXISTS conversations_delete_v2  ON conversations;
DROP POLICY IF EXISTS conversations_select     ON conversations;
DROP POLICY IF EXISTS conversations_insert     ON conversations;
DROP POLICY IF EXISTS conversations_update     ON conversations;
DROP POLICY IF EXISTS conversations_delete     ON conversations;

CREATE POLICY conversations_select_v2 ON conversations FOR SELECT
  USING (hotel_id::text = app_hotel_id());

CREATE POLICY conversations_insert_v2 ON conversations FOR INSERT
  WITH CHECK (hotel_id::text = app_hotel_id());

CREATE POLICY conversations_update_v2 ON conversations FOR UPDATE
  USING (hotel_id::text = app_hotel_id())
  WITH CHECK (hotel_id::text = app_hotel_id());

CREATE POLICY conversations_delete_v2 ON conversations FOR DELETE
  USING (hotel_id::text = app_hotel_id());


-- =============================================================================
-- TABLE: messages
-- No tiene hotel_id directo -- se verifica via JOIN a conversations
-- =============================================================================

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS messages_select_v2  ON messages;
DROP POLICY IF EXISTS messages_insert_v2  ON messages;
DROP POLICY IF EXISTS messages_update_v2  ON messages;
DROP POLICY IF EXISTS messages_delete_v2  ON messages;
DROP POLICY IF EXISTS messages_select     ON messages;
DROP POLICY IF EXISTS messages_insert     ON messages;
DROP POLICY IF EXISTS messages_update     ON messages;
DROP POLICY IF EXISTS messages_delete     ON messages;

CREATE POLICY messages_select_v2 ON messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = messages.conversation_id
        AND c.hotel_id::text = app_hotel_id()
    )
  );

CREATE POLICY messages_insert_v2 ON messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = messages.conversation_id
        AND c.hotel_id::text = app_hotel_id()
    )
  );

CREATE POLICY messages_update_v2 ON messages FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = messages.conversation_id
        AND c.hotel_id::text = app_hotel_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = messages.conversation_id
        AND c.hotel_id::text = app_hotel_id()
    )
  );

CREATE POLICY messages_delete_v2 ON messages FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = messages.conversation_id
        AND c.hotel_id::text = app_hotel_id()
    )
  );


-- =============================================================================
-- TABLE: services
-- =============================================================================

ALTER TABLE services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS services_select_v2  ON services;
DROP POLICY IF EXISTS services_insert_v2  ON services;
DROP POLICY IF EXISTS services_update_v2  ON services;
DROP POLICY IF EXISTS services_delete_v2  ON services;
DROP POLICY IF EXISTS services_select     ON services;
DROP POLICY IF EXISTS services_insert     ON services;
DROP POLICY IF EXISTS services_update     ON services;
DROP POLICY IF EXISTS services_delete     ON services;

CREATE POLICY services_select_v2 ON services FOR SELECT
  USING (hotel_id::text = app_hotel_id());

CREATE POLICY services_insert_v2 ON services FOR INSERT
  WITH CHECK (hotel_id::text = app_hotel_id());

CREATE POLICY services_update_v2 ON services FOR UPDATE
  USING (hotel_id::text = app_hotel_id())
  WITH CHECK (hotel_id::text = app_hotel_id());

CREATE POLICY services_delete_v2 ON services FOR DELETE
  USING (hotel_id::text = app_hotel_id());


-- =============================================================================
-- TABLE: orders
-- =============================================================================

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS orders_select_v2  ON orders;
DROP POLICY IF EXISTS orders_insert_v2  ON orders;
DROP POLICY IF EXISTS orders_update_v2  ON orders;
DROP POLICY IF EXISTS orders_delete_v2  ON orders;

CREATE POLICY orders_select_v2 ON orders FOR SELECT
  USING (hotel_id::text = app_hotel_id());

CREATE POLICY orders_insert_v2 ON orders FOR INSERT
  WITH CHECK (hotel_id::text = app_hotel_id());

CREATE POLICY orders_update_v2 ON orders FOR UPDATE
  USING (hotel_id::text = app_hotel_id())
  WITH CHECK (hotel_id::text = app_hotel_id());

CREATE POLICY orders_delete_v2 ON orders FOR DELETE
  USING (hotel_id::text = app_hotel_id());


-- =============================================================================
-- TABLE: order_items (via JOIN a orders)
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'order_items'
  ) THEN
    EXECUTE 'ALTER TABLE order_items ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS order_items_select_v2 ON order_items';
    EXECUTE 'DROP POLICY IF EXISTS order_items_insert_v2 ON order_items';
    EXECUTE 'DROP POLICY IF EXISTS order_items_update_v2 ON order_items';
    EXECUTE 'DROP POLICY IF EXISTS order_items_delete_v2 ON order_items';

    EXECUTE $pol$
      CREATE POLICY order_items_select_v2 ON order_items FOR SELECT
        USING (EXISTS (SELECT 1 FROM orders o WHERE o.id = order_items.order_id AND o.hotel_id::text = app_hotel_id()))
    $pol$;
    EXECUTE $pol$
      CREATE POLICY order_items_insert_v2 ON order_items FOR INSERT
        WITH CHECK (EXISTS (SELECT 1 FROM orders o WHERE o.id = order_items.order_id AND o.hotel_id::text = app_hotel_id()))
    $pol$;
    EXECUTE $pol$
      CREATE POLICY order_items_update_v2 ON order_items FOR UPDATE
        USING (EXISTS (SELECT 1 FROM orders o WHERE o.id = order_items.order_id AND o.hotel_id::text = app_hotel_id()))
        WITH CHECK (EXISTS (SELECT 1 FROM orders o WHERE o.id = order_items.order_id AND o.hotel_id::text = app_hotel_id()))
    $pol$;
    EXECUTE $pol$
      CREATE POLICY order_items_delete_v2 ON order_items FOR DELETE
        USING (EXISTS (SELECT 1 FROM orders o WHERE o.id = order_items.order_id AND o.hotel_id::text = app_hotel_id()))
    $pol$;

    RAISE NOTICE 'RLS aplicado a order_items';
  ELSE
    RAISE NOTICE 'Tabla order_items no existe -- se omite';
  END IF;
END;
$$;


-- =============================================================================
-- TABLE: reviews
-- =============================================================================

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reviews_select_v2  ON reviews;
DROP POLICY IF EXISTS reviews_insert_v2  ON reviews;
DROP POLICY IF EXISTS reviews_update_v2  ON reviews;
DROP POLICY IF EXISTS reviews_delete_v2  ON reviews;
DROP POLICY IF EXISTS reviews_select     ON reviews;
DROP POLICY IF EXISTS reviews_insert     ON reviews;
DROP POLICY IF EXISTS reviews_update     ON reviews;
DROP POLICY IF EXISTS reviews_delete     ON reviews;

CREATE POLICY reviews_select_v2 ON reviews FOR SELECT
  USING (hotel_id::text = app_hotel_id());

CREATE POLICY reviews_insert_v2 ON reviews FOR INSERT
  WITH CHECK (hotel_id::text = app_hotel_id());

CREATE POLICY reviews_update_v2 ON reviews FOR UPDATE
  USING (hotel_id::text = app_hotel_id())
  WITH CHECK (hotel_id::text = app_hotel_id());

CREATE POLICY reviews_delete_v2 ON reviews FOR DELETE
  USING (hotel_id::text = app_hotel_id());


-- =============================================================================
-- TABLE: hotel_integrations
-- =============================================================================

ALTER TABLE hotel_integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hotel_integrations_select_v2  ON hotel_integrations;
DROP POLICY IF EXISTS hotel_integrations_insert_v2  ON hotel_integrations;
DROP POLICY IF EXISTS hotel_integrations_update_v2  ON hotel_integrations;
DROP POLICY IF EXISTS hotel_integrations_delete_v2  ON hotel_integrations;

CREATE POLICY hotel_integrations_select_v2 ON hotel_integrations FOR SELECT
  USING (hotel_id::text = app_hotel_id());

CREATE POLICY hotel_integrations_insert_v2 ON hotel_integrations FOR INSERT
  WITH CHECK (hotel_id::text = app_hotel_id());

CREATE POLICY hotel_integrations_update_v2 ON hotel_integrations FOR UPDATE
  USING (hotel_id::text = app_hotel_id())
  WITH CHECK (hotel_id::text = app_hotel_id());

CREATE POLICY hotel_integrations_delete_v2 ON hotel_integrations FOR DELETE
  USING (hotel_id::text = app_hotel_id());


-- =============================================================================
-- TABLE: integration_sync_logs
-- =============================================================================

ALTER TABLE integration_sync_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS integration_sync_logs_select_v2  ON integration_sync_logs;
DROP POLICY IF EXISTS integration_sync_logs_insert_v2  ON integration_sync_logs;
DROP POLICY IF EXISTS integration_sync_logs_update_v2  ON integration_sync_logs;
DROP POLICY IF EXISTS integration_sync_logs_delete_v2  ON integration_sync_logs;

CREATE POLICY integration_sync_logs_select_v2 ON integration_sync_logs FOR SELECT
  USING (hotel_id::text = app_hotel_id());

CREATE POLICY integration_sync_logs_insert_v2 ON integration_sync_logs FOR INSERT
  WITH CHECK (hotel_id::text = app_hotel_id());

CREATE POLICY integration_sync_logs_update_v2 ON integration_sync_logs FOR UPDATE
  USING (hotel_id::text = app_hotel_id())
  WITH CHECK (hotel_id::text = app_hotel_id());

CREATE POLICY integration_sync_logs_delete_v2 ON integration_sync_logs FOR DELETE
  USING (hotel_id::text = app_hotel_id());


-- =============================================================================
-- INDICES DE SOPORTE
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id   ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversations_hotel_id     ON conversations(hotel_id);
CREATE INDEX IF NOT EXISTS idx_guests_hotel_id            ON guests(hotel_id);
CREATE INDEX IF NOT EXISTS idx_reservations_hotel_id      ON reservations(hotel_id);
CREATE INDEX IF NOT EXISTS idx_services_hotel_id          ON services(hotel_id);
CREATE INDEX IF NOT EXISTS idx_reviews_hotel_id           ON reviews(hotel_id);
CREATE INDEX IF NOT EXISTS idx_orders_hotel_id            ON orders(hotel_id);
CREATE INDEX IF NOT EXISTS idx_users_hotel_id             ON users(hotel_id);
CREATE INDEX IF NOT EXISTS idx_hotel_integrations_hotel   ON hotel_integrations(hotel_id);
CREATE INDEX IF NOT EXISTS idx_sync_logs_hotel            ON integration_sync_logs(hotel_id, synced_at DESC);


-- =============================================================================
-- VERIFICACION POST-APLICACION
-- =============================================================================
-- Ejecutar en Supabase SQL Editor para confirmar:
--
-- SELECT tablename, rowsecurity FROM pg_tables
-- WHERE schemaname = 'public'
-- ORDER BY tablename;
--
-- SELECT tablename, policyname, cmd FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename, policyname;
--
-- Test manual:
-- SELECT set_config('app.hotel_id', 'tu-hotel-uuid-aqui', true);
-- SELECT * FROM guests;  -- debe mostrar solo guests de ese hotel
-- =============================================================================
