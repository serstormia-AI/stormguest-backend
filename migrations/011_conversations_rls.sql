-- Allow authenticated guests to read their own conversations
-- Required so the messages_guest_select policy subquery works
CREATE POLICY "guests_read_own_conversations" ON public.conversations
FOR SELECT TO authenticated
USING (guest_id = (SELECT id FROM public.guests WHERE auth_user_id = auth.uid() LIMIT 1));
