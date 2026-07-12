-- =============================================================================
-- StormGuest -- Migration 017: Tabla de auditoría de invitaciones de staff
--
-- Contexto (Fase 3 de seguridad):
--   Antes de esta migration, solo super_admin podía crear usuarios.
--   La Fase 3 permite que hotel_manager invite a su propio personal.
--   El flujo real usa supabase.auth.admin.inviteUserByEmail() en el backend
--   (igual que SuperAdmin.jsx). Esta tabla es solo registro de auditoría:
--   quién invitó a quién, con qué rol, desde qué hotel, cuándo.
--
-- NO contiene tokens ni lógica de redeem — eso lo maneja Supabase Auth.
-- =============================================================================

CREATE TABLE IF NOT EXISTS staff_invitations (
    id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    hotel_id         text        NOT NULL,
    email            text        NOT NULL,
    role             text        NOT NULL
                                 CHECK (role IN ('hotel_manager', 'reception', 'housekeeping', 'gastronomy')),
    invited_by_email text,                   -- email del hotel_manager que invitó
    auth_user_id     uuid,                   -- auth.uid() del invitado, seteado al crear la invitación
    created_at       timestamptz DEFAULT now()
);

ALTER TABLE staff_invitations ENABLE ROW LEVEL SECURITY;

-- hotel_manager solo ve las invitaciones de su propio hotel
CREATE POLICY "manager_select_own_hotel"
    ON staff_invitations FOR SELECT
    USING (staff_has_role('hotel_manager') AND hotel_id = staff_hotel_id());

-- hotel_manager solo puede insertar para su propio hotel
CREATE POLICY "manager_insert_own_hotel"
    ON staff_invitations FOR INSERT
    WITH CHECK (staff_has_role('hotel_manager') AND hotel_id = staff_hotel_id());

-- super_admin ve y escribe todo
CREATE POLICY "super_admin_all"
    ON staff_invitations FOR ALL
    USING (staff_has_role('super_admin'));
