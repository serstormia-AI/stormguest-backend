-- Migration 014: RLS policies for guest sessions
-- The guest app uses Supabase Auth for guests (auth_user_id stored in guests table).
-- Migration 013 only covered staff (users table). Guests need their own SELECT policies
-- on the tables they read client-side: requests, experiences, guests, reservations, reviews.

-- ── Helper functions ──────────────────────────────────────────────────────────

-- Returns the guests.id of the currently authenticated guest
CREATE OR REPLACE FUNCTION public.my_guest_id()
RETURNS uuid AS $$
  SELECT id FROM public.guests WHERE auth_user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Returns the guests.hotel_id of the currently authenticated guest (TEXT — same as users.hotel_id)
CREATE OR REPLACE FUNCTION public.my_guest_hotel_id()
RETURNS text AS $$
  SELECT hotel_id FROM public.guests WHERE auth_user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ── experiences ───────────────────────────────────────────────────────────────
-- experiences.hotel_id is uuid; cast to text for universal comparison

CREATE POLICY experiences_guest_select ON public.experiences
  FOR SELECT TO authenticated
  USING (hotel_id::text = my_guest_hotel_id());

-- ── requests ─────────────────────────────────────────────────────────────────
-- requests.hotel_id is uuid; requests.guest_id is uuid

CREATE POLICY requests_guest_select ON public.requests
  FOR SELECT TO authenticated
  USING (guest_id = my_guest_id());

CREATE POLICY requests_guest_insert ON public.requests
  FOR INSERT TO authenticated
  WITH CHECK (guest_id = my_guest_id());

-- ── guests ────────────────────────────────────────────────────────────────────

CREATE POLICY guests_self_select ON public.guests
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());

-- ── reservations ──────────────────────────────────────────────────────────────

CREATE POLICY reservations_guest_select ON public.reservations
  FOR SELECT TO authenticated
  USING (guest_id = my_guest_id());

-- ── reviews ───────────────────────────────────────────────────────────────────
-- reviews.hotel_id is TEXT — direct comparison, no cast needed

CREATE POLICY reviews_guest_insert ON public.reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    guest_id = my_guest_id()
    AND hotel_id = my_guest_hotel_id()
  );

CREATE POLICY reviews_guest_select ON public.reviews
  FOR SELECT TO authenticated
  USING (guest_id = my_guest_id());
