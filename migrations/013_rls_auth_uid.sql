-- =============================================================================
-- StormGuest -- Migration 013: RLS basado en auth.uid() (Supabase Auth)
-- Compatible: PostgreSQL 14+ / Supabase
--
-- REEMPLAZA la migration 008 que usaba app_hotel_id() + SET session variable.
-- Ese patron no funciona con PostgREST/HTTP (cada request es conexion nueva).
-- Este patron usa auth.uid() que Supabase inyecta automaticamente del JWT.
--
-- Ejecutar como superuser desde Supabase SQL Editor.
-- El service_role key sigue bypassando RLS -- solo el anon key la respeta.
--
-- NOTA: users.hotel_id es TEXT en este schema.
--       staff_hotel_id() devuelve TEXT.
--       En todas las politicas usamos ::text para comparacion uniforme,
--       funcionando tanto si hotel_id es uuid como text.
-- =============================================================================

-- ─── Funciones helper ────────────────────────────────────────────────────────

-- Devuelve el hotel_id (como text) del staff user logueado por Supabase Auth
CREATE OR REPLACE FUNCTION public.staff_hotel_id()
RETURNS text AS $$
  SELECT hotel_id FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Verifica si el usuario logueado es super_admin
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.users
    WHERE auth_user_id = auth.uid() AND role = 'super_admin'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;


-- ─── TABLE: hotels ───────────────────────────────────────────────────────────

ALTER TABLE hotels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hotels_select_v2    ON hotels;
DROP POLICY IF EXISTS hotels_insert_v2    ON hotels;
DROP POLICY IF EXISTS hotels_update_v2    ON hotels;
DROP POLICY IF EXISTS hotels_delete_v2    ON hotels;
DROP POLICY IF EXISTS hotels_staff_select ON hotels;
DROP POLICY IF EXISTS hotels_staff_insert ON hotels;
DROP POLICY IF EXISTS hotels_staff_update ON hotels;
DROP POLICY IF EXISTS hotels_staff_delete ON hotels;

-- hotels.id es uuid → casteamos a text para comparar con staff_hotel_id() (text)
CREATE POLICY hotels_staff_select ON hotels FOR SELECT TO authenticated
  USING (is_super_admin() OR id::text = staff_hotel_id());

CREATE POLICY hotels_staff_insert ON hotels FOR INSERT TO authenticated
  WITH CHECK (is_super_admin());

CREATE POLICY hotels_staff_update ON hotels FOR UPDATE TO authenticated
  USING (is_super_admin() OR id::text = staff_hotel_id())
  WITH CHECK (is_super_admin() OR id::text = staff_hotel_id());

CREATE POLICY hotels_staff_delete ON hotels FOR DELETE TO authenticated
  USING (is_super_admin());


-- ─── TABLE: users ────────────────────────────────────────────────────────────

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_select_v2    ON users;
DROP POLICY IF EXISTS users_insert_v2    ON users;
DROP POLICY IF EXISTS users_update_v2    ON users;
DROP POLICY IF EXISTS users_delete_v2    ON users;
DROP POLICY IF EXISTS users_staff_select ON users;
DROP POLICY IF EXISTS users_staff_insert ON users;
DROP POLICY IF EXISTS users_staff_update ON users;
DROP POLICY IF EXISTS users_staff_delete ON users;

-- users.hotel_id es text → comparacion directa, y tambien permite leer el propio perfil
CREATE POLICY users_staff_select ON users FOR SELECT TO authenticated
  USING (is_super_admin() OR hotel_id = staff_hotel_id() OR auth_user_id = auth.uid());

CREATE POLICY users_staff_insert ON users FOR INSERT TO authenticated
  WITH CHECK (is_super_admin() OR hotel_id = staff_hotel_id());

CREATE POLICY users_staff_update ON users FOR UPDATE TO authenticated
  USING (is_super_admin() OR hotel_id = staff_hotel_id() OR auth_user_id = auth.uid())
  WITH CHECK (is_super_admin() OR hotel_id = staff_hotel_id());

CREATE POLICY users_staff_delete ON users FOR DELETE TO authenticated
  USING (is_super_admin() OR hotel_id = staff_hotel_id());


-- ─── TABLE: guests ───────────────────────────────────────────────────────────

ALTER TABLE guests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS guests_select_v2      ON guests;
DROP POLICY IF EXISTS guests_insert_v2      ON guests;
DROP POLICY IF EXISTS guests_update_v2      ON guests;
DROP POLICY IF EXISTS guests_delete_v2      ON guests;
DROP POLICY IF EXISTS guests_select         ON guests;
DROP POLICY IF EXISTS guests_select_own     ON guests;
DROP POLICY IF EXISTS guests_insert         ON guests;
DROP POLICY IF EXISTS guests_update         ON guests;
DROP POLICY IF EXISTS guests_delete         ON guests;
DROP POLICY IF EXISTS guests_staff_select   ON guests;
DROP POLICY IF EXISTS guests_staff_insert   ON guests;
DROP POLICY IF EXISTS guests_staff_update   ON guests;
DROP POLICY IF EXISTS guests_staff_delete   ON guests;

-- ::text es no-op si ya es text, seguro si es uuid
CREATE POLICY guests_staff_select ON guests FOR SELECT TO authenticated
  USING (is_super_admin() OR hotel_id::text = staff_hotel_id());

CREATE POLICY guests_staff_insert ON guests FOR INSERT TO authenticated
  WITH CHECK (is_super_admin() OR hotel_id::text = staff_hotel_id());

CREATE POLICY guests_staff_update ON guests FOR UPDATE TO authenticated
  USING (is_super_admin() OR hotel_id::text = staff_hotel_id())
  WITH CHECK (is_super_admin() OR hotel_id::text = staff_hotel_id());

CREATE POLICY guests_staff_delete ON guests FOR DELETE TO authenticated
  USING (is_super_admin() OR hotel_id::text = staff_hotel_id());


-- ─── TABLE: reservations ─────────────────────────────────────────────────────

ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reservations_select_v2    ON reservations;
DROP POLICY IF EXISTS reservations_insert_v2    ON reservations;
DROP POLICY IF EXISTS reservations_update_v2    ON reservations;
DROP POLICY IF EXISTS reservations_delete_v2    ON reservations;
DROP POLICY IF EXISTS reservations_select       ON reservations;
DROP POLICY IF EXISTS reservations_insert       ON reservations;
DROP POLICY IF EXISTS reservations_update       ON reservations;
DROP POLICY IF EXISTS reservations_delete       ON reservations;
DROP POLICY IF EXISTS reservations_staff_select ON reservations;
DROP POLICY IF EXISTS reservations_staff_insert ON reservations;
DROP POLICY IF EXISTS reservations_staff_update ON reservations;
DROP POLICY IF EXISTS reservations_staff_delete ON reservations;

CREATE POLICY reservations_staff_select ON reservations FOR SELECT TO authenticated
  USING (is_super_admin() OR hotel_id::text = staff_hotel_id());

CREATE POLICY reservations_staff_insert ON reservations FOR INSERT TO authenticated
  WITH CHECK (is_super_admin() OR hotel_id::text = staff_hotel_id());

CREATE POLICY reservations_staff_update ON reservations FOR UPDATE TO authenticated
  USING (is_super_admin() OR hotel_id::text = staff_hotel_id())
  WITH CHECK (is_super_admin() OR hotel_id::text = staff_hotel_id());

CREATE POLICY reservations_staff_delete ON reservations FOR DELETE TO authenticated
  USING (is_super_admin() OR hotel_id::text = staff_hotel_id());


-- ─── TABLE: conversations ────────────────────────────────────────────────────

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conversations_select_v2       ON conversations;
DROP POLICY IF EXISTS conversations_insert_v2       ON conversations;
DROP POLICY IF EXISTS conversations_update_v2       ON conversations;
DROP POLICY IF EXISTS conversations_delete_v2       ON conversations;
DROP POLICY IF EXISTS conversations_select          ON conversations;
DROP POLICY IF EXISTS conversations_insert          ON conversations;
DROP POLICY IF EXISTS conversations_update          ON conversations;
DROP POLICY IF EXISTS conversations_delete          ON conversations;
DROP POLICY IF EXISTS conversations_staff_select    ON conversations;
DROP POLICY IF EXISTS conversations_staff_insert    ON conversations;
DROP POLICY IF EXISTS conversations_staff_update    ON conversations;
DROP POLICY IF EXISTS conversations_staff_delete    ON conversations;
DROP POLICY IF EXISTS "guests_read_own_conversations" ON conversations;

CREATE POLICY conversations_staff_select ON conversations FOR SELECT TO authenticated
  USING (
    is_super_admin()
    OR hotel_id::text = staff_hotel_id()
    -- Guests ven sus propias conversaciones
    OR guest_id = (SELECT id FROM public.guests WHERE auth_user_id = auth.uid() LIMIT 1)
  );

CREATE POLICY conversations_staff_insert ON conversations FOR INSERT TO authenticated
  WITH CHECK (is_super_admin() OR hotel_id::text = staff_hotel_id());

CREATE POLICY conversations_staff_update ON conversations FOR UPDATE TO authenticated
  USING (is_super_admin() OR hotel_id::text = staff_hotel_id())
  WITH CHECK (is_super_admin() OR hotel_id::text = staff_hotel_id());

CREATE POLICY conversations_staff_delete ON conversations FOR DELETE TO authenticated
  USING (is_super_admin() OR hotel_id::text = staff_hotel_id());


-- ─── TABLE: messages ─────────────────────────────────────────────────────────

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS messages_select_v2        ON messages;
DROP POLICY IF EXISTS messages_insert_v2        ON messages;
DROP POLICY IF EXISTS messages_update_v2        ON messages;
DROP POLICY IF EXISTS messages_delete_v2        ON messages;
DROP POLICY IF EXISTS messages_select           ON messages;
DROP POLICY IF EXISTS messages_insert           ON messages;
DROP POLICY IF EXISTS messages_update           ON messages;
DROP POLICY IF EXISTS messages_delete           ON messages;
DROP POLICY IF EXISTS messages_staff_select     ON messages;
DROP POLICY IF EXISTS messages_staff_insert     ON messages;
DROP POLICY IF EXISTS messages_staff_update     ON messages;
DROP POLICY IF EXISTS messages_staff_delete     ON messages;
DROP POLICY IF EXISTS "messages_guest_select"   ON messages;

-- Acceso via JOIN a conversations (messages no tiene hotel_id directo)
CREATE POLICY messages_staff_select ON messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
      AND (
        is_super_admin()
        OR c.hotel_id::text = staff_hotel_id()
        OR c.guest_id = (SELECT id FROM public.guests WHERE auth_user_id = auth.uid() LIMIT 1)
      )
    )
  );

CREATE POLICY messages_staff_insert ON messages FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
      AND (
        is_super_admin()
        OR c.hotel_id::text = staff_hotel_id()
        OR c.guest_id = (SELECT id FROM public.guests WHERE auth_user_id = auth.uid() LIMIT 1)
      )
    )
  );

CREATE POLICY messages_staff_update ON messages FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
      AND (is_super_admin() OR c.hotel_id::text = staff_hotel_id())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
      AND (is_super_admin() OR c.hotel_id::text = staff_hotel_id())
    )
  );

CREATE POLICY messages_staff_delete ON messages FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
      AND (is_super_admin() OR c.hotel_id::text = staff_hotel_id())
    )
  );


-- ─── TABLE: experiences ──────────────────────────────────────────────────────

ALTER TABLE experiences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS experiences_staff_select ON experiences;
DROP POLICY IF EXISTS experiences_staff_insert ON experiences;
DROP POLICY IF EXISTS experiences_staff_update ON experiences;
DROP POLICY IF EXISTS experiences_staff_delete ON experiences;

CREATE POLICY experiences_staff_select ON experiences FOR SELECT TO authenticated
  USING (is_super_admin() OR hotel_id::text = staff_hotel_id());

CREATE POLICY experiences_staff_insert ON experiences FOR INSERT TO authenticated
  WITH CHECK (is_super_admin() OR hotel_id::text = staff_hotel_id());

CREATE POLICY experiences_staff_update ON experiences FOR UPDATE TO authenticated
  USING (is_super_admin() OR hotel_id::text = staff_hotel_id())
  WITH CHECK (is_super_admin() OR hotel_id::text = staff_hotel_id());

CREATE POLICY experiences_staff_delete ON experiences FOR DELETE TO authenticated
  USING (is_super_admin() OR hotel_id::text = staff_hotel_id());


-- ─── TABLE: requests ─────────────────────────────────────────────────────────

ALTER TABLE requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS requests_staff_select         ON requests;
DROP POLICY IF EXISTS requests_staff_insert         ON requests;
DROP POLICY IF EXISTS requests_staff_update         ON requests;
DROP POLICY IF EXISTS requests_staff_delete         ON requests;
DROP POLICY IF EXISTS "guests_read_own_requests"    ON requests;

CREATE POLICY requests_staff_select ON requests FOR SELECT TO authenticated
  USING (
    is_super_admin()
    OR hotel_id::text = staff_hotel_id()
    OR guest_id = (SELECT id FROM public.guests WHERE auth_user_id = auth.uid() LIMIT 1)
  );

CREATE POLICY requests_staff_insert ON requests FOR INSERT TO authenticated
  WITH CHECK (
    is_super_admin()
    OR hotel_id::text = staff_hotel_id()
    OR guest_id = (SELECT id FROM public.guests WHERE auth_user_id = auth.uid() LIMIT 1)
  );

CREATE POLICY requests_staff_update ON requests FOR UPDATE TO authenticated
  USING (is_super_admin() OR hotel_id::text = staff_hotel_id())
  WITH CHECK (is_super_admin() OR hotel_id::text = staff_hotel_id());

CREATE POLICY requests_staff_delete ON requests FOR DELETE TO authenticated
  USING (is_super_admin() OR hotel_id::text = staff_hotel_id());


-- ─── TABLE: services ─────────────────────────────────────────────────────────

ALTER TABLE services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS services_select_v2    ON services;
DROP POLICY IF EXISTS services_insert_v2    ON services;
DROP POLICY IF EXISTS services_update_v2    ON services;
DROP POLICY IF EXISTS services_delete_v2    ON services;
DROP POLICY IF EXISTS services_staff_select ON services;
DROP POLICY IF EXISTS services_staff_insert ON services;
DROP POLICY IF EXISTS services_staff_update ON services;
DROP POLICY IF EXISTS services_staff_delete ON services;

CREATE POLICY services_staff_select ON services FOR SELECT TO authenticated
  USING (is_super_admin() OR hotel_id::text = staff_hotel_id());

CREATE POLICY services_staff_insert ON services FOR INSERT TO authenticated
  WITH CHECK (is_super_admin() OR hotel_id::text = staff_hotel_id());

CREATE POLICY services_staff_update ON services FOR UPDATE TO authenticated
  USING (is_super_admin() OR hotel_id::text = staff_hotel_id())
  WITH CHECK (is_super_admin() OR hotel_id::text = staff_hotel_id());

CREATE POLICY services_staff_delete ON services FOR DELETE TO authenticated
  USING (is_super_admin() OR hotel_id::text = staff_hotel_id());


-- ─── TABLE: orders ───────────────────────────────────────────────────────────

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS orders_select_v2    ON orders;
DROP POLICY IF EXISTS orders_insert_v2    ON orders;
DROP POLICY IF EXISTS orders_update_v2    ON orders;
DROP POLICY IF EXISTS orders_delete_v2    ON orders;
DROP POLICY IF EXISTS orders_staff_select ON orders;
DROP POLICY IF EXISTS orders_staff_insert ON orders;
DROP POLICY IF EXISTS orders_staff_update ON orders;
DROP POLICY IF EXISTS orders_staff_delete ON orders;

CREATE POLICY orders_staff_select ON orders FOR SELECT TO authenticated
  USING (is_super_admin() OR hotel_id::text = staff_hotel_id());

CREATE POLICY orders_staff_insert ON orders FOR INSERT TO authenticated
  WITH CHECK (is_super_admin() OR hotel_id::text = staff_hotel_id());

CREATE POLICY orders_staff_update ON orders FOR UPDATE TO authenticated
  USING (is_super_admin() OR hotel_id::text = staff_hotel_id())
  WITH CHECK (is_super_admin() OR hotel_id::text = staff_hotel_id());

CREATE POLICY orders_staff_delete ON orders FOR DELETE TO authenticated
  USING (is_super_admin() OR hotel_id::text = staff_hotel_id());


-- ─── TABLE: order_items ──────────────────────────────────────────────────────

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
    EXECUTE 'DROP POLICY IF EXISTS order_items_staff_select ON order_items';
    EXECUTE 'DROP POLICY IF EXISTS order_items_staff_insert ON order_items';
    EXECUTE 'DROP POLICY IF EXISTS order_items_staff_update ON order_items';
    EXECUTE 'DROP POLICY IF EXISTS order_items_staff_delete ON order_items';

    EXECUTE $pol$
      CREATE POLICY order_items_staff_select ON order_items FOR SELECT TO authenticated
        USING (EXISTS (
          SELECT 1 FROM orders o
          WHERE o.id = order_items.order_id
          AND (is_super_admin() OR o.hotel_id::text = staff_hotel_id())
        ))
    $pol$;
    EXECUTE $pol$
      CREATE POLICY order_items_staff_insert ON order_items FOR INSERT TO authenticated
        WITH CHECK (EXISTS (
          SELECT 1 FROM orders o
          WHERE o.id = order_items.order_id
          AND (is_super_admin() OR o.hotel_id::text = staff_hotel_id())
        ))
    $pol$;
    EXECUTE $pol$
      CREATE POLICY order_items_staff_update ON order_items FOR UPDATE TO authenticated
        USING (EXISTS (
          SELECT 1 FROM orders o
          WHERE o.id = order_items.order_id
          AND (is_super_admin() OR o.hotel_id::text = staff_hotel_id())
        ))
        WITH CHECK (EXISTS (
          SELECT 1 FROM orders o
          WHERE o.id = order_items.order_id
          AND (is_super_admin() OR o.hotel_id::text = staff_hotel_id())
        ))
    $pol$;
    EXECUTE $pol$
      CREATE POLICY order_items_staff_delete ON order_items FOR DELETE TO authenticated
        USING (EXISTS (
          SELECT 1 FROM orders o
          WHERE o.id = order_items.order_id
          AND (is_super_admin() OR o.hotel_id::text = staff_hotel_id())
        ))
    $pol$;

    RAISE NOTICE 'RLS actualizado en order_items';
  ELSE
    RAISE NOTICE 'Tabla order_items no existe -- se omite';
  END IF;
END;
$$;


-- ─── TABLE: reviews ──────────────────────────────────────────────────────────

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reviews_select_v2         ON reviews;
DROP POLICY IF EXISTS reviews_insert_v2         ON reviews;
DROP POLICY IF EXISTS reviews_update_v2         ON reviews;
DROP POLICY IF EXISTS reviews_delete_v2         ON reviews;
DROP POLICY IF EXISTS reviews_staff_select      ON reviews;
DROP POLICY IF EXISTS reviews_staff_insert      ON reviews;
DROP POLICY IF EXISTS reviews_staff_update      ON reviews;
DROP POLICY IF EXISTS reviews_staff_delete      ON reviews;
DROP POLICY IF EXISTS "guests_insert_own_review" ON reviews;

CREATE POLICY reviews_staff_select ON reviews FOR SELECT TO authenticated
  USING (is_super_admin() OR hotel_id::text = staff_hotel_id());

CREATE POLICY reviews_staff_insert ON reviews FOR INSERT TO authenticated
  WITH CHECK (
    is_super_admin()
    OR hotel_id::text = staff_hotel_id()
    OR guest_id = (SELECT id FROM public.guests WHERE auth_user_id = auth.uid() LIMIT 1)
  );

CREATE POLICY reviews_staff_update ON reviews FOR UPDATE TO authenticated
  USING (is_super_admin() OR hotel_id::text = staff_hotel_id())
  WITH CHECK (is_super_admin() OR hotel_id::text = staff_hotel_id());

CREATE POLICY reviews_staff_delete ON reviews FOR DELETE TO authenticated
  USING (is_super_admin() OR hotel_id::text = staff_hotel_id());


-- ─── TABLE: hotel_integrations ───────────────────────────────────────────────

ALTER TABLE hotel_integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hotel_integrations_select_v2    ON hotel_integrations;
DROP POLICY IF EXISTS hotel_integrations_insert_v2    ON hotel_integrations;
DROP POLICY IF EXISTS hotel_integrations_update_v2    ON hotel_integrations;
DROP POLICY IF EXISTS hotel_integrations_delete_v2    ON hotel_integrations;
DROP POLICY IF EXISTS hotel_integrations_staff_select ON hotel_integrations;
DROP POLICY IF EXISTS hotel_integrations_staff_insert ON hotel_integrations;
DROP POLICY IF EXISTS hotel_integrations_staff_update ON hotel_integrations;
DROP POLICY IF EXISTS hotel_integrations_staff_delete ON hotel_integrations;

CREATE POLICY hotel_integrations_staff_select ON hotel_integrations FOR SELECT TO authenticated
  USING (is_super_admin() OR hotel_id::text = staff_hotel_id());

CREATE POLICY hotel_integrations_staff_insert ON hotel_integrations FOR INSERT TO authenticated
  WITH CHECK (is_super_admin() OR hotel_id::text = staff_hotel_id());

CREATE POLICY hotel_integrations_staff_update ON hotel_integrations FOR UPDATE TO authenticated
  USING (is_super_admin() OR hotel_id::text = staff_hotel_id())
  WITH CHECK (is_super_admin() OR hotel_id::text = staff_hotel_id());

CREATE POLICY hotel_integrations_staff_delete ON hotel_integrations FOR DELETE TO authenticated
  USING (is_super_admin() OR hotel_id::text = staff_hotel_id());


-- ─── TABLE: integration_sync_logs ────────────────────────────────────────────

ALTER TABLE integration_sync_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS integration_sync_logs_select_v2    ON integration_sync_logs;
DROP POLICY IF EXISTS integration_sync_logs_insert_v2    ON integration_sync_logs;
DROP POLICY IF EXISTS integration_sync_logs_update_v2    ON integration_sync_logs;
DROP POLICY IF EXISTS integration_sync_logs_delete_v2    ON integration_sync_logs;
DROP POLICY IF EXISTS integration_sync_logs_staff_select ON integration_sync_logs;
DROP POLICY IF EXISTS integration_sync_logs_staff_insert ON integration_sync_logs;
DROP POLICY IF EXISTS integration_sync_logs_staff_delete ON integration_sync_logs;

CREATE POLICY integration_sync_logs_staff_select ON integration_sync_logs FOR SELECT TO authenticated
  USING (is_super_admin() OR hotel_id::text = staff_hotel_id());

CREATE POLICY integration_sync_logs_staff_insert ON integration_sync_logs FOR INSERT TO authenticated
  WITH CHECK (is_super_admin() OR hotel_id::text = staff_hotel_id());

CREATE POLICY integration_sync_logs_staff_delete ON integration_sync_logs FOR DELETE TO authenticated
  USING (is_super_admin() OR hotel_id::text = staff_hotel_id());


-- =============================================================================
-- VERIFICACION POST-APLICACION
-- =============================================================================
-- Ejecutar en Supabase SQL Editor para confirmar:
--
-- SELECT tablename, rowsecurity FROM pg_tables
-- WHERE schemaname = 'public' ORDER BY tablename;
--
-- SELECT tablename, policyname, cmd FROM pg_policies
-- WHERE schemaname = 'public' ORDER BY tablename, policyname;
--
-- Test con usuario logueado (anon key + session):
-- SELECT staff_hotel_id();    -- debe devolver el hotel_id (text) del usuario
-- SELECT is_super_admin();    -- debe devolver true/false segun rol
-- SELECT * FROM guests;       -- debe devolver SOLO guests del hotel del usuario
-- =============================================================================
