-- =============================================================================
-- StormGuest — Migration 008: RLS basado en app.hotel_id (backend JWT propio)
-- Compatible: PostgreSQL 14+ / Supabase
--
-- CONTEXTO
-- --------
-- El backend usa su propio JWT (Express + jsonwebtoken), NO Supabase Auth.
-- Por eso las políticas de esta migración NO leen request.jwt.claims, sino
-- una variable de sesión que el backend setea explícitamente antes de cada
-- query sensible:
--
--   SET LOCAL app.hotel_id = '<hotel_id>';
--
-- Ver al final del archivo cómo el backend debe hacer esto en Node.js.
--
-- DIFERENCIAS CON 001_enable_rls.sql
-- ------------------------------------
-- La migración 001 usaba current_hotel_id() y current_user_role() que leen
-- request.jwt.claims de Supabase Auth — esas funciones no aplican aquí.
-- Esta migración reemplaza las políticas de las tablas ya cubiertas por 001
-- y agrega las tablas nuevas: users, orders, order_items, hotel_integrations,
-- integration_sync_logs.
--
-- IMPORTANTE: Ejecutar como superuser o rol postgres desde Supabase SQL Editor.
-- El service_role key bypasea RLS — el backend debe usar ANON KEY para queries
-- de usuarios finales (ver sección al final del archivo).
--
-- TIPO DE DATO: hotels.id y hotel_id en todas las tablas son TEXT/VARCHAR(50),
-- NO uuid. Las políticas comparan texto directamente.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- HELPER FUNCTION: leer app.hotel_id desde la variable de sesión
--
-- Retorna TEXT (o NULL si no está seteada).
-- Se declara SECURITY DEFINER para que siempre funcione aunque el rol actual
-- no tenga permisos de superuser.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_hotel_id()
RETURNS text AS $$
  SELECT current_setting('app.hotel_id', true);
$$ LANGUAGE sql STABLE SECURITY DEFINER;


-- =============================================================================
-- TABLE: hotels
-- Política: solo puede ver/editar la fila cuyo id coincide con app.hotel_id
-- INSERT: queda restringido al backend (service_role), que bypasea RLS.
--         Si algún día se permite via anon key, se agrega WITH CHECK aquí.
-- =============================================================================

ALTER TABLE hotels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hotels_select_v2     ON hotels;
DROP POLICY IF EXISTS hotels_insert_v2     ON hotels;
DROP POLICY IF EXISTS hotels_update_v2     ON hotels;
DROP POLICY IF EXISTS hotels_delete_v2     ON hotels;

-- Limpiar políticas de la migración 001 si existen
DROP POLICY IF EXISTS hotels_select  ON hotels;
DROP POLICY IF EXISTS hotels_insert  ON hotels;
DROP POLICY IF EXISTS hotels_update  ON hotels;
DROP POLICY IF EXISTS hotels_delete  ON hotels;

CREATE POLICY hotels_select_v2 ON hotels
  FOR SELECT
  USING (
    id = app_hotel_id()
  );

CREATE POLICY hotels_insert_v2 ON hotels
  FOR INSERT
  WITH CHECK (
    id = app_hotel_id()
  );

CREATE POLICY hotels_update_v2 ON hotels
  FOR UPDATE
  USING (
    id = app_hotel_id()
  )
  WITH CHECK (
    id = app_hotel_id()
  );

CREATE POLICY hotels_delete_v2 ON hotels
  FOR DELETE
  USING (
    id = app_hotel_id()
  );


-- =============================================================================
-- TABLE: users
-- Aislamiento: solo usuarios del mismo hotel_id
-- =============================================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_select_v2  ON users;
DROP POLICY IF EXISTS users_insert_v2  ON users;
DROP POLICY IF EXISTS users_update_v2  ON users;
DROP POLICY IF EXISTS users_delete_v2  ON users;

CREATE POLICY users_select_v2 ON users
  FOR SELECT
  USING (
    hotel_id = app_hotel_id()
  );

CREATE POLICY users_insert_v2 ON users
  FOR INSERT
  WITH CHECK (
    hotel_id = app_hotel_id()
  );

CREATE POLICY users_update_v2 ON users
  FOR UPDATE
  USING (
    hotel_id = app_hotel_id()
  )
  WITH CHECK (
    hotel_id = app_hotel_id()
  );

CREATE POLICY users_delete_v2 ON users
  FOR DELETE
  USING (
    hotel_id = app_hotel_id()
  );


-- =============================================================================
-- TABLE: guests
-- =============================================================================

ALTER TABLE guests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS guests_select_v2  ON guests;
DROP POLICY IF EXISTS guests_insert_v2  ON guests;
DROP POLICY IF EXISTS guests_update_v2  ON guests;
DROP POLICY IF EXISTS guests_delete_v2  ON guests;

-- Limpiar políticas de 001
DROP POLICY IF EXISTS guests_select     ON guests;
DROP POLICY IF EXISTS guests_select_own ON guests;
DROP POLICY IF EXISTS guests_insert     ON guests;
DROP POLICY IF EXISTS guests_update     ON guests;
DROP POLICY IF EXISTS guests_delete     ON guests;

CREATE POLICY guests_select_v2 ON guests
  FOR SELECT
  USING (
    hotel_id = app_hotel_id()
  );

CREATE POLICY guests_insert_v2 ON guests
  FOR INSERT
  WITH CHECK (
    hotel_id = app_hotel_id()
  );

CREATE POLICY guests_update_v2 ON guests
  FOR UPDATE
  USING (
    hotel_id = app_hotel_id()
  )
  WITH CHECK (
    hotel_id = app_hotel_id()
  );

CREATE POLICY guests_delete_v2 ON guests
  FOR DELETE
  USING (
    hotel_id = app_hotel_id()
  );


-- =============================================================================
-- TABLE: reservations
-- =============================================================================

ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reservations_select_v2  ON reservations;
DROP POLICY IF EXISTS reservations_insert_v2  ON reservations;
DROP POLICY IF EXISTS reservations_update_v2  ON reservations;
DROP POLICY IF EXISTS reservations_delete_v2  ON reservations;

DROP POLICY IF EXISTS reservations_select  ON reservations;
DROP POLICY IF EXISTS reservations_insert  ON reservations;
DROP POLICY IF EXISTS reservations_update  ON reservations;
DROP POLICY IF EXISTS reservations_delete  ON reservations;

CREATE POLICY reservations_select_v2 ON reservations
  FOR SELECT
  USING (
    hotel_id = app_hotel_id()
  );

CREATE POLICY reservations_insert_v2 ON reservations
  FOR INSERT
  WITH CHECK (
    hotel_id = app_hotel_id()
  );

CREATE POLICY reservations_update_v2 ON reservations
  FOR UPDATE
  USING (
    hotel_id = app_hotel_id()
  )
  WITH CHECK (
    hotel_id = app_hotel_id()
  );

CREATE POLICY reservations_delete_v2 ON reservations
  FOR DELETE
  USING (
    hotel_id = app_hotel_id()
  );


-- =============================================================================
-- TABLE: conversations
-- =============================================================================

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conversations_select_v2  ON conversations;
DROP POLICY IF EXISTS conversations_insert_v2  ON conversations;
DROP POLICY IF EXISTS conversations_update_v2  ON conversations;
DROP POLICY IF EXISTS conversations_delete_v2  ON conversations;

DROP POLICY IF EXISTS conversations_select  ON conversations;
DROP POLICY IF EXISTS conversations_insert  ON conversations;
DROP POLICY IF EXISTS conversations_update  ON conversations;
DROP POLICY IF EXISTS conversations_delete  ON conversations;

CREATE POLICY conversations_select_v2 ON conversations
  FOR SELECT
  USING (
    hotel_id = app_hotel_id()
  );

CREATE POLICY conversations_insert_v2 ON conversations
  FOR INSERT
  WITH CHECK (
    hotel_id = app_hotel_id()
  );

CREATE POLICY conversations_update_v2 ON conversations
  FOR UPDATE
  USING (
    hotel_id = app_hotel_id()
  )
  WITH CHECK (
    hotel_id = app_hotel_id()
  );

CREATE POLICY conversations_delete_v2 ON conversations
  FOR DELETE
  USING (
    hotel_id = app_hotel_id()
  );


-- =============================================================================
-- TABLE: messages
-- No tiene hotel_id directo — se verifica via JOIN a conversations.
-- Índice recomendado: ya existe idx_messages_conversation_id (creado en 001).
-- =============================================================================

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS messages_select_v2  ON messages;
DROP POLICY IF EXISTS messages_insert_v2  ON messages;
DROP POLICY IF EXISTS messages_update_v2  ON messages;
DROP POLICY IF EXISTS messages_delete_v2  ON messages;

DROP POLICY IF EXISTS messages_select  ON messages;
DROP POLICY IF EXISTS messages_insert  ON messages;
DROP POLICY IF EXISTS messages_update  ON messages;
DROP POLICY IF EXISTS messages_delete  ON messages;

CREATE POLICY messages_select_v2 ON messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM conversations c
      WHERE c.id = messages.conversation_id
        AND c.hotel_id = app_hotel_id()
    )
  );

CREATE POLICY messages_insert_v2 ON messages
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM conversations c
      WHERE c.id = messages.conversation_id
        AND c.hotel_id = app_hotel_id()
    )
  );

CREATE POLICY messages_update_v2 ON messages
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM conversations c
      WHERE c.id = messages.conversation_id
        AND c.hotel_id = app_hotel_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM conversations c
      WHERE c.id = messages.conversation_id
        AND c.hotel_id = app_hotel_id()
    )
  );

CREATE POLICY messages_delete_v2 ON messages
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM conversations c
      WHERE c.id = messages.conversation_id
        AND c.hotel_id = app_hotel_id()
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

DROP POLICY IF EXISTS services_select  ON services;
DROP POLICY IF EXISTS services_insert  ON services;
DROP POLICY IF EXISTS services_update  ON services;
DROP POLICY IF EXISTS services_delete  ON services;

CREATE POLICY services_select_v2 ON services
  FOR SELECT
  USING (
    hotel_id = app_hotel_id()
  );

CREATE POLICY services_insert_v2 ON services
  FOR INSERT
  WITH CHECK (
    hotel_id = app_hotel_id()
  );

CREATE POLICY services_update_v2 ON services
  FOR UPDATE
  USING (
    hotel_id = app_hotel_id()
  )
  WITH CHECK (
    hotel_id = app_hotel_id()
  );

CREATE POLICY services_delete_v2 ON services
  FOR DELETE
  USING (
    hotel_id = app_hotel_id()
  );


-- =============================================================================
-- TABLE: orders
-- hotel_id es TEXT (creado en 003_orders.sql)
-- =============================================================================

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS orders_select_v2  ON orders;
DROP POLICY IF EXISTS orders_insert_v2  ON orders;
DROP POLICY IF EXISTS orders_update_v2  ON orders;
DROP POLICY IF EXISTS orders_delete_v2  ON orders;

CREATE POLICY orders_select_v2 ON orders
  FOR SELECT
  USING (
    hotel_id = app_hotel_id()
  );

CREATE POLICY orders_insert_v2 ON orders
  FOR INSERT
  WITH CHECK (
    hotel_id = app_hotel_id()
  );

CREATE POLICY orders_update_v2 ON orders
  FOR UPDATE
  USING (
    hotel_id = app_hotel_id()
  )
  WITH CHECK (
    hotel_id = app_hotel_id()
  );

CREATE POLICY orders_delete_v2 ON orders
  FOR DELETE
  USING (
    hotel_id = app_hotel_id()
  );


-- =============================================================================
-- TABLE: order_items
-- No tiene hotel_id directo — se verifica via JOIN a orders.
-- NOTA: Si la tabla order_items no existe aún en el proyecto, crear primero
--       con: CREATE TABLE order_items (id ..., order_id UUID REFERENCES orders(id), ...)
-- =============================================================================

-- Habilitar RLS solo si la tabla existe
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'order_items'
  ) THEN
    EXECUTE 'ALTER TABLE order_items ENABLE ROW LEVEL SECURITY';

    -- Limpiar políticas previas
    EXECUTE 'DROP POLICY IF EXISTS order_items_select_v2 ON order_items';
    EXECUTE 'DROP POLICY IF EXISTS order_items_insert_v2 ON order_items';
    EXECUTE 'DROP POLICY IF EXISTS order_items_update_v2 ON order_items';
    EXECUTE 'DROP POLICY IF EXISTS order_items_delete_v2 ON order_items';

    EXECUTE $pol$
      CREATE POLICY order_items_select_v2 ON order_items
        FOR SELECT
        USING (
          EXISTS (
            SELECT 1 FROM orders o
            WHERE o.id = order_items.order_id
              AND o.hotel_id = app_hotel_id()
          )
        )
    $pol$;

    EXECUTE $pol$
      CREATE POLICY order_items_insert_v2 ON order_items
        FOR INSERT
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM orders o
            WHERE o.id = order_items.order_id
              AND o.hotel_id = app_hotel_id()
          )
        )
    $pol$;

    EXECUTE $pol$
      CREATE POLICY order_items_update_v2 ON order_items
        FOR UPDATE
        USING (
          EXISTS (
            SELECT 1 FROM orders o
            WHERE o.id = order_items.order_id
              AND o.hotel_id = app_hotel_id()
          )
        )
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM orders o
            WHERE o.id = order_items.order_id
              AND o.hotel_id = app_hotel_id()
          )
        )
    $pol$;

    EXECUTE $pol$
      CREATE POLICY order_items_delete_v2 ON order_items
        FOR DELETE
        USING (
          EXISTS (
            SELECT 1 FROM orders o
            WHERE o.id = order_items.order_id
              AND o.hotel_id = app_hotel_id()
          )
        )
    $pol$;

    RAISE NOTICE 'RLS policies applied to order_items';
  ELSE
    RAISE NOTICE 'Table order_items does not exist — skipping RLS for this table';
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

DROP POLICY IF EXISTS reviews_select  ON reviews;
DROP POLICY IF EXISTS reviews_insert  ON reviews;
DROP POLICY IF EXISTS reviews_update  ON reviews;
DROP POLICY IF EXISTS reviews_delete  ON reviews;

CREATE POLICY reviews_select_v2 ON reviews
  FOR SELECT
  USING (
    hotel_id = app_hotel_id()
  );

CREATE POLICY reviews_insert_v2 ON reviews
  FOR INSERT
  WITH CHECK (
    hotel_id = app_hotel_id()
  );

CREATE POLICY reviews_update_v2 ON reviews
  FOR UPDATE
  USING (
    hotel_id = app_hotel_id()
  )
  WITH CHECK (
    hotel_id = app_hotel_id()
  );

CREATE POLICY reviews_delete_v2 ON reviews
  FOR DELETE
  USING (
    hotel_id = app_hotel_id()
  );


-- =============================================================================
-- TABLE: hotel_integrations
-- hotel_id es TEXT NOT NULL (creado en 005_integrations.sql)
-- =============================================================================

ALTER TABLE hotel_integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hotel_integrations_select_v2  ON hotel_integrations;
DROP POLICY IF EXISTS hotel_integrations_insert_v2  ON hotel_integrations;
DROP POLICY IF EXISTS hotel_integrations_update_v2  ON hotel_integrations;
DROP POLICY IF EXISTS hotel_integrations_delete_v2  ON hotel_integrations;

CREATE POLICY hotel_integrations_select_v2 ON hotel_integrations
  FOR SELECT
  USING (
    hotel_id = app_hotel_id()
  );

CREATE POLICY hotel_integrations_insert_v2 ON hotel_integrations
  FOR INSERT
  WITH CHECK (
    hotel_id = app_hotel_id()
  );

CREATE POLICY hotel_integrations_update_v2 ON hotel_integrations
  FOR UPDATE
  USING (
    hotel_id = app_hotel_id()
  )
  WITH CHECK (
    hotel_id = app_hotel_id()
  );

CREATE POLICY hotel_integrations_delete_v2 ON hotel_integrations
  FOR DELETE
  USING (
    hotel_id = app_hotel_id()
  );


-- =============================================================================
-- TABLE: integration_sync_logs
-- hotel_id es TEXT NOT NULL (creado en 006_sync_logs.sql)
-- =============================================================================

ALTER TABLE integration_sync_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS integration_sync_logs_select_v2  ON integration_sync_logs;
DROP POLICY IF EXISTS integration_sync_logs_insert_v2  ON integration_sync_logs;
DROP POLICY IF EXISTS integration_sync_logs_update_v2  ON integration_sync_logs;
DROP POLICY IF EXISTS integration_sync_logs_delete_v2  ON integration_sync_logs;

CREATE POLICY integration_sync_logs_select_v2 ON integration_sync_logs
  FOR SELECT
  USING (
    hotel_id = app_hotel_id()
  );

CREATE POLICY integration_sync_logs_insert_v2 ON integration_sync_logs
  FOR INSERT
  WITH CHECK (
    hotel_id = app_hotel_id()
  );

CREATE POLICY integration_sync_logs_update_v2 ON integration_sync_logs
  FOR UPDATE
  USING (
    hotel_id = app_hotel_id()
  )
  WITH CHECK (
    hotel_id = app_hotel_id()
  );

CREATE POLICY integration_sync_logs_delete_v2 ON integration_sync_logs
  FOR DELETE
  USING (
    hotel_id = app_hotel_id()
  );


-- =============================================================================
-- ÍNDICES DE SOPORTE (idempotentes — ya algunos creados en migraciones previas)
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id    ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversations_hotel_id      ON conversations(hotel_id);
CREATE INDEX IF NOT EXISTS idx_guests_hotel_id             ON guests(hotel_id);
CREATE INDEX IF NOT EXISTS idx_reservations_hotel_id       ON reservations(hotel_id);
CREATE INDEX IF NOT EXISTS idx_services_hotel_id           ON services(hotel_id);
CREATE INDEX IF NOT EXISTS idx_reviews_hotel_id            ON reviews(hotel_id);
CREATE INDEX IF NOT EXISTS idx_orders_hotel_id             ON orders(hotel_id);
CREATE INDEX IF NOT EXISTS idx_users_hotel_id              ON users(hotel_id);
CREATE INDEX IF NOT EXISTS idx_hotel_integrations_hotel    ON hotel_integrations(hotel_id);
CREATE INDEX IF NOT EXISTS idx_sync_logs_hotel             ON integration_sync_logs(hotel_id, synced_at DESC);


-- =============================================================================
-- CÓMO EL BACKEND DEBE SETEAR app.hotel_id ANTES DE QUERIES SENSIBLES
-- =============================================================================
--
-- El backend (Express + node-postgres) debe setear la variable de sesión en
-- cada transacción que involucre datos de un hotel específico.
-- Esta variable es LOCAL a la transacción (se limpia automáticamente al hacer
-- COMMIT o ROLLBACK).
--
-- OPCIÓN A — node-postgres directo (pool.js o database.js):
-- ---------------------------------------------------------
--
--   const { pool } = require('./database');
--
--   async function queryWithHotelContext(hotelId, queryText, params) {
--     const client = await pool.connect();
--     try {
--       await client.query('BEGIN');
--       await client.query(
--         "SELECT set_config('app.hotel_id', $1, true)",  -- true = LOCAL (hasta el COMMIT)
--         [hotelId]
--       );
--       const result = await client.query(queryText, params);
--       await client.query('COMMIT');
--       return result;
--     } catch (err) {
--       await client.query('ROLLBACK');
--       throw err;
--     } finally {
--       client.release();
--     }
--   }
--
-- OPCIÓN B — Supabase JS Client con RPC:
-- ----------------------------------------
-- El cliente Supabase JS no expone SET LOCAL directamente. Usar una función
-- RPC wrapper o setear la config antes de cada query dentro de una transacción:
--
--   // Esto NO aplica con el cliente JS estándar de Supabase porque cada
--   // llamada es una request HTTP separada sin estado de sesión.
--   // Se recomienda usar OPCIÓN A (node-postgres) para queries que requieran RLS.
--
-- OPCIÓN C — Middleware Express que setea el contexto:
-- ----------------------------------------------------
--
--   // middleware/hotelContext.js
--   const { pool } = require('../database');
--
--   const hotelContext = async (req, res, next) => {
--     const hotelId = req.user?.hotel_id;   // ya validado por auth.js
--     if (!hotelId) return res.status(401).json({ error: 'hotel_id requerido' });
--
--     // Adjuntar helper al request para usar en route handlers
--     req.dbQuery = async (text, params) => {
--       const client = await pool.connect();
--       try {
--         await client.query('BEGIN');
--         await client.query("SELECT set_config('app.hotel_id', $1, true)", [hotelId]);
--         const result = await client.query(text, params);
--         await client.query('COMMIT');
--         return result;
--       } catch (err) {
--         await client.query('ROLLBACK');
--         throw err;
--       } finally {
--         client.release();
--       }
--     };
--     next();
--   };
--
--   module.exports = hotelContext;
--
--   // En el router:
--   router.get('/guests', auth(), hotelContext, async (req, res) => {
--     const result = await req.dbQuery('SELECT * FROM guests ORDER BY created_at DESC');
--     res.json(result.rows);
--   });
--
-- ADVERTENCIA: el SUPABASE_SERVICE_ROLE_KEY bypasea RLS completamente.
-- Para que RLS sea efectivo, usar SUPABASE_ANON_KEY en las queries de usuario.
-- El service_role key solo debe usarse para tareas administrativas del backend
-- que requieren acceso cross-tenant (ej: billing, health-checks, backups).
-- =============================================================================


-- =============================================================================
-- VERIFICACIÓN POST-APLICACIÓN
-- =============================================================================
-- Ejecutar estas queries en Supabase SQL Editor para confirmar que RLS quedó activo:
--
-- -- Ver qué tablas tienen RLS habilitado:
-- SELECT tablename, rowsecurity, forcerowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public'
--   AND tablename IN (
--     'hotels','users','guests','reservations','conversations','messages',
--     'services','orders','order_items','reviews',
--     'hotel_integrations','integration_sync_logs'
--   )
-- ORDER BY tablename;
--
-- -- Ver todas las políticas activas:
-- SELECT tablename, policyname, permissive, cmd, qual
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename, policyname;
--
-- -- Test manual: simular un request del hotel 'hotel_abc'
-- SET LOCAL app.hotel_id = 'hotel_abc';
-- SELECT * FROM guests;   -- debe ver solo los guests de hotel_abc
-- RESET app.hotel_id;
-- =============================================================================
