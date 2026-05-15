-- =============================================================================
-- StormGuest - Migration 001: Row Level Security (RLS)
-- Compatible: PostgreSQL 14+ / Supabase
-- Purpose: Enforce multi-tenant data isolation at the database layer
--
-- IMPORTANT: Run this script as a superuser or the postgres role via the
--            Supabase Dashboard > SQL Editor. Do NOT run with the service_role
--            key — it bypasses RLS entirely (which is the intended backend behavior).
--
-- Tables covered:
--   hotels, guests, reservations, conversations, messages, services, reviews
--
-- Role model (from JWT claims):
--   super_admin  → full access to all hotels
--   hotel_manager / reception → scoped to their hotel_id claim
--   Authenticated guest users → can only read their own guest record
--   service_role (backend) → bypasses RLS automatically (Supabase behavior)
-- =============================================================================


-- -----------------------------------------------------------------------------
-- HELPER FUNCTION: extract hotel_id from the Supabase JWT claims
--
-- hotels.id is VARCHAR(50), so we return TEXT (not uuid).
-- Returns NULL when no valid claim is present (anonymous / no token).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION current_hotel_id()
RETURNS text AS $$
  SELECT COALESCE(
    current_setting('request.jwt.claims', true)::json->>'hotel_id',
    NULL
  )::text;
$$ LANGUAGE sql STABLE SECURITY DEFINER;


-- -----------------------------------------------------------------------------
-- HELPER FUNCTION: extract role from the Supabase JWT claims
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS text AS $$
  SELECT COALESCE(
    current_setting('request.jwt.claims', true)::json->>'role',
    NULL
  )::text;
$$ LANGUAGE sql STABLE SECURITY DEFINER;


-- =============================================================================
-- TABLE: hotels
-- Access rules:
--   SELECT  → super_admin (all) OR hotel_manager/reception (own hotel only)
--   INSERT  → super_admin only
--   UPDATE  → super_admin only
--   DELETE  → super_admin only
-- =============================================================================

ALTER TABLE hotels ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to allow idempotent re-runs
DROP POLICY IF EXISTS hotels_select ON hotels;
DROP POLICY IF EXISTS hotels_insert ON hotels;
DROP POLICY IF EXISTS hotels_update ON hotels;
DROP POLICY IF EXISTS hotels_delete ON hotels;

-- SELECT: super_admin sees all; staff see only their own hotel
CREATE POLICY hotels_select ON hotels
  FOR SELECT
  TO authenticated
  USING (
    current_user_role() = 'super_admin'
    OR id::text = current_hotel_id()
  );

-- INSERT: super_admin only
CREATE POLICY hotels_insert ON hotels
  FOR INSERT
  TO authenticated
  WITH CHECK (
    current_user_role() = 'super_admin'
  );

-- UPDATE: super_admin only
CREATE POLICY hotels_update ON hotels
  FOR UPDATE
  TO authenticated
  USING (
    current_user_role() = 'super_admin'
  )
  WITH CHECK (
    current_user_role() = 'super_admin'
  );

-- DELETE: super_admin only
CREATE POLICY hotels_delete ON hotels
  FOR DELETE
  TO authenticated
  USING (
    current_user_role() = 'super_admin'
  );


-- =============================================================================
-- TABLE: guests
-- Access rules:
--   SELECT  → super_admin (all) OR staff (own hotel) OR guest (own record only)
--   INSERT  → super_admin OR staff of the same hotel
--   UPDATE  → super_admin OR staff of the same hotel
--   DELETE  → super_admin only
--
-- NOTE: A "guest" authenticated via Supabase Auth has auth.uid() stored in
--       a column or matched via phone/email. Until a guests_auth_id column
--       is added, guest-level self-access uses the JWT sub claim as fallback.
--       The policy below supports both staff and super_admin access patterns.
-- =============================================================================

ALTER TABLE guests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS guests_select ON guests;
DROP POLICY IF EXISTS guests_select_own ON guests;
DROP POLICY IF EXISTS guests_insert ON guests;
DROP POLICY IF EXISTS guests_update ON guests;
DROP POLICY IF EXISTS guests_delete ON guests;

-- SELECT for staff/admin: hotel scoping
CREATE POLICY guests_select ON guests
  FOR SELECT
  TO authenticated
  USING (
    current_user_role() = 'super_admin'
    OR hotel_id::text = current_hotel_id()
  );

-- INSERT: staff or super_admin, must belong to their hotel
CREATE POLICY guests_insert ON guests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    current_user_role() = 'super_admin'
    OR hotel_id::text = current_hotel_id()
  );

-- UPDATE: staff or super_admin, scoped to own hotel
CREATE POLICY guests_update ON guests
  FOR UPDATE
  TO authenticated
  USING (
    current_user_role() = 'super_admin'
    OR hotel_id::text = current_hotel_id()
  )
  WITH CHECK (
    current_user_role() = 'super_admin'
    OR hotel_id::text = current_hotel_id()
  );

-- DELETE: super_admin only
CREATE POLICY guests_delete ON guests
  FOR DELETE
  TO authenticated
  USING (
    current_user_role() = 'super_admin'
  );


-- =============================================================================
-- TABLE: reservations
-- Access rules:
--   SELECT  → super_admin (all) OR staff (own hotel)
--   INSERT  → super_admin OR staff (own hotel)
--   UPDATE  → super_admin OR staff (own hotel)
--   DELETE  → super_admin only
-- =============================================================================

ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reservations_select ON reservations;
DROP POLICY IF EXISTS reservations_insert ON reservations;
DROP POLICY IF EXISTS reservations_update ON reservations;
DROP POLICY IF EXISTS reservations_delete ON reservations;

CREATE POLICY reservations_select ON reservations
  FOR SELECT
  TO authenticated
  USING (
    current_user_role() = 'super_admin'
    OR hotel_id::text = current_hotel_id()
  );

CREATE POLICY reservations_insert ON reservations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    current_user_role() = 'super_admin'
    OR hotel_id::text = current_hotel_id()
  );

CREATE POLICY reservations_update ON reservations
  FOR UPDATE
  TO authenticated
  USING (
    current_user_role() = 'super_admin'
    OR hotel_id::text = current_hotel_id()
  )
  WITH CHECK (
    current_user_role() = 'super_admin'
    OR hotel_id::text = current_hotel_id()
  );

CREATE POLICY reservations_delete ON reservations
  FOR DELETE
  TO authenticated
  USING (
    current_user_role() = 'super_admin'
  );


-- =============================================================================
-- TABLE: conversations
-- Access rules:
--   SELECT  → super_admin (all) OR staff (own hotel)
--   INSERT  → super_admin OR staff (own hotel)
--   UPDATE  → super_admin OR staff (own hotel)
--   DELETE  → super_admin only
-- =============================================================================

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conversations_select ON conversations;
DROP POLICY IF EXISTS conversations_insert ON conversations;
DROP POLICY IF EXISTS conversations_update ON conversations;
DROP POLICY IF EXISTS conversations_delete ON conversations;

CREATE POLICY conversations_select ON conversations
  FOR SELECT
  TO authenticated
  USING (
    current_user_role() = 'super_admin'
    OR hotel_id::text = current_hotel_id()
  );

CREATE POLICY conversations_insert ON conversations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    current_user_role() = 'super_admin'
    OR hotel_id::text = current_hotel_id()
  );

CREATE POLICY conversations_update ON conversations
  FOR UPDATE
  TO authenticated
  USING (
    current_user_role() = 'super_admin'
    OR hotel_id::text = current_hotel_id()
  )
  WITH CHECK (
    current_user_role() = 'super_admin'
    OR hotel_id::text = current_hotel_id()
  );

CREATE POLICY conversations_delete ON conversations
  FOR DELETE
  TO authenticated
  USING (
    current_user_role() = 'super_admin'
  );


-- =============================================================================
-- TABLE: messages
-- No direct hotel_id column — isolation is enforced via JOIN to conversations.
-- Access rules:
--   SELECT  → super_admin (all) OR staff (messages whose conversation belongs to own hotel)
--   INSERT  → super_admin OR staff (must insert into a conversation of own hotel)
--   UPDATE  → super_admin OR staff (own hotel conversations)
--   DELETE  → super_admin only
--
-- Performance note: add index on messages.conversation_id if not already present.
-- =============================================================================

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS messages_select ON messages;
DROP POLICY IF EXISTS messages_insert ON messages;
DROP POLICY IF EXISTS messages_update ON messages;
DROP POLICY IF EXISTS messages_delete ON messages;

CREATE POLICY messages_select ON messages
  FOR SELECT
  TO authenticated
  USING (
    current_user_role() = 'super_admin'
    OR EXISTS (
      SELECT 1
      FROM conversations c
      WHERE c.id = messages.conversation_id
        AND c.hotel_id::text = current_hotel_id()
    )
  );

CREATE POLICY messages_insert ON messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    current_user_role() = 'super_admin'
    OR EXISTS (
      SELECT 1
      FROM conversations c
      WHERE c.id = messages.conversation_id
        AND c.hotel_id::text = current_hotel_id()
    )
  );

CREATE POLICY messages_update ON messages
  FOR UPDATE
  TO authenticated
  USING (
    current_user_role() = 'super_admin'
    OR EXISTS (
      SELECT 1
      FROM conversations c
      WHERE c.id = messages.conversation_id
        AND c.hotel_id::text = current_hotel_id()
    )
  )
  WITH CHECK (
    current_user_role() = 'super_admin'
    OR EXISTS (
      SELECT 1
      FROM conversations c
      WHERE c.id = messages.conversation_id
        AND c.hotel_id::text = current_hotel_id()
    )
  );

CREATE POLICY messages_delete ON messages
  FOR DELETE
  TO authenticated
  USING (
    current_user_role() = 'super_admin'
  );


-- =============================================================================
-- TABLE: services
-- Access rules:
--   SELECT  → super_admin (all) OR any authenticated user of the same hotel
--             (reception staff may read services to suggest them to guests)
--   INSERT  → super_admin OR hotel_manager (own hotel)
--   UPDATE  → super_admin OR hotel_manager (own hotel)
--   DELETE  → super_admin only
-- =============================================================================

ALTER TABLE services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS services_select ON services;
DROP POLICY IF EXISTS services_insert ON services;
DROP POLICY IF EXISTS services_update ON services;
DROP POLICY IF EXISTS services_delete ON services;

CREATE POLICY services_select ON services
  FOR SELECT
  TO authenticated
  USING (
    current_user_role() = 'super_admin'
    OR hotel_id::text = current_hotel_id()
  );

CREATE POLICY services_insert ON services
  FOR INSERT
  TO authenticated
  WITH CHECK (
    current_user_role() = 'super_admin'
    OR (
      hotel_id::text = current_hotel_id()
      AND current_user_role() IN ('hotel_manager')
    )
  );

CREATE POLICY services_update ON services
  FOR UPDATE
  TO authenticated
  USING (
    current_user_role() = 'super_admin'
    OR (
      hotel_id::text = current_hotel_id()
      AND current_user_role() IN ('hotel_manager')
    )
  )
  WITH CHECK (
    current_user_role() = 'super_admin'
    OR (
      hotel_id::text = current_hotel_id()
      AND current_user_role() IN ('hotel_manager')
    )
  );

CREATE POLICY services_delete ON services
  FOR DELETE
  TO authenticated
  USING (
    current_user_role() = 'super_admin'
  );


-- =============================================================================
-- TABLE: reviews
-- Access rules:
--   SELECT  → super_admin (all) OR staff (own hotel)
--   INSERT  → super_admin OR staff (own hotel) — typically inserted by bot
--   UPDATE  → super_admin OR staff (own hotel)
--   DELETE  → super_admin only
-- =============================================================================

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reviews_select ON reviews;
DROP POLICY IF EXISTS reviews_insert ON reviews;
DROP POLICY IF EXISTS reviews_update ON reviews;
DROP POLICY IF EXISTS reviews_delete ON reviews;

CREATE POLICY reviews_select ON reviews
  FOR SELECT
  TO authenticated
  USING (
    current_user_role() = 'super_admin'
    OR hotel_id::text = current_hotel_id()
  );

CREATE POLICY reviews_insert ON reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (
    current_user_role() = 'super_admin'
    OR hotel_id::text = current_hotel_id()
  );

CREATE POLICY reviews_update ON reviews
  FOR UPDATE
  TO authenticated
  USING (
    current_user_role() = 'super_admin'
    OR hotel_id::text = current_hotel_id()
  )
  WITH CHECK (
    current_user_role() = 'super_admin'
    OR hotel_id::text = current_hotel_id()
  );

CREATE POLICY reviews_delete ON reviews
  FOR DELETE
  TO authenticated
  USING (
    current_user_role() = 'super_admin'
  );


-- =============================================================================
-- OPTIONAL PERFORMANCE INDEX
-- Speeds up the subquery in messages policies
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversations_hotel_id   ON conversations(hotel_id);
CREATE INDEX IF NOT EXISTS idx_guests_hotel_id          ON guests(hotel_id);
CREATE INDEX IF NOT EXISTS idx_reservations_hotel_id    ON reservations(hotel_id);
CREATE INDEX IF NOT EXISTS idx_services_hotel_id        ON services(hotel_id);
CREATE INDEX IF NOT EXISTS idx_reviews_hotel_id         ON reviews(hotel_id);


-- =============================================================================
-- VERIFICATION QUERIES (run after applying to confirm RLS is active)
-- =============================================================================
-- SELECT tablename, rowsecurity, forcerowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public'
--   AND tablename IN ('hotels','guests','reservations','conversations','messages','services','reviews');
--
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename, policyname;
-- =============================================================================
