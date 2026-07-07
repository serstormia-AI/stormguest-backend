-- Migration 015: Internal staff messaging
-- Channel-based messaging between departments.
-- to_role: 'all' | 'reception' | 'hotel_manager' | 'housekeeping' | 'gastronomy'
-- hotel_id is uuid (consistent with main data tables).
-- from_name/from_role are denormalized — no FK, consistent with no-constraint pattern.

CREATE TABLE IF NOT EXISTS public.staff_messages (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  hotel_id   uuid        NOT NULL,
  from_name  text        NOT NULL,
  from_role  text        NOT NULL,
  to_role    text        NOT NULL,
  content    text        NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.staff_messages ENABLE ROW LEVEL SECURITY;

-- Staff reads all messages for their hotel (open visibility — all depts see all channels)
CREATE POLICY staff_messages_select ON public.staff_messages
  FOR SELECT TO authenticated
  USING (is_super_admin() OR hotel_id::text = staff_hotel_id());

-- Staff inserts messages for their hotel
CREATE POLICY staff_messages_insert ON public.staff_messages
  FOR INSERT TO authenticated
  WITH CHECK (is_super_admin() OR hotel_id::text = staff_hotel_id());
