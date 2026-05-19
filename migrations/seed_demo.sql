-- =============================================================================
-- StormGuest — Seed de datos demo para Hotel Demo
-- Ejecutar en Supabase SQL Editor
-- Crea: 3 huéspedes, 3 reservas activas, experiencias/servicios, órdenes de prueba
-- =============================================================================

-- UUID del Hotel Demo (obtenido de la DB)
DO $$
DECLARE
    v_hotel_id UUID := '0600c026-3568-4507-a646-dbe273a5f624';

    -- Guest IDs
    v_guest1_id UUID := gen_random_uuid();
    v_guest2_id UUID := gen_random_uuid();
    v_guest3_id UUID := gen_random_uuid();

    -- Reservation IDs
    v_res1_id UUID := gen_random_uuid();
    v_res2_id UUID := gen_random_uuid();
    v_res3_id UUID := gen_random_uuid();

    -- Service IDs
    v_svc1_id UUID := gen_random_uuid();
    v_svc2_id UUID := gen_random_uuid();
    v_svc3_id UUID := gen_random_uuid();
    v_svc4_id UUID := gen_random_uuid();

BEGIN

-- =============================================================================
-- HUÉSPEDES
-- Para hacer login usar: habitación + apellido (case insensitive)
-- =============================================================================

INSERT INTO guests (id, hotel_id, first_name, last_name, email, phone, room_number)
VALUES
    (v_guest1_id, v_hotel_id, 'Carlos',    'García',    'carlos.garcia@email.com',    '+54911111111', '101'),
    (v_guest2_id, v_hotel_id, 'María',     'González',  'maria.gonzalez@email.com',   '+54922222222', '205'),
    (v_guest3_id, v_hotel_id, 'John',      'Smith',     'john.smith@email.com',       '+19735551234', '310')
ON CONFLICT DO NOTHING;


-- =============================================================================
-- RESERVAS ACTIVAS (checkout en el futuro para que pasen la validación)
-- =============================================================================

INSERT INTO reservations (id, hotel_id, guest_id, room_number, check_in, check_out, status)
VALUES
    (v_res1_id, v_hotel_id, v_guest1_id, '101', CURRENT_DATE,       CURRENT_DATE + 5,  'checked_in'),
    (v_res2_id, v_hotel_id, v_guest2_id, '205', CURRENT_DATE - 1,   CURRENT_DATE + 3,  'checked_in'),
    (v_res3_id, v_hotel_id, v_guest3_id, '310', CURRENT_DATE + 1,   CURRENT_DATE + 7,  'confirmed')
ON CONFLICT DO NOTHING;


-- =============================================================================
-- SERVICIOS / EXPERIENCIAS DEL CATÁLOGO
-- =============================================================================

INSERT INTO services (id, hotel_id, name, description, price, category, active)
VALUES
    (v_svc1_id, v_hotel_id, 'Desayuno en habitación',
     'Desayuno completo con café, medialunas y jugo de naranja fresco. Servicio hasta las 11hs.',
     2500, 'food', true),

    (v_svc2_id, v_hotel_id, 'Masaje relax 60 min',
     'Masaje de cuerpo completo en nuestro spa. Incluye aromaterapia.',
     8500, 'wellness', true),

    (v_svc3_id, v_hotel_id, 'Late Check-out',
     'Extendé tu estadía hasta las 15hs sin cargo adicional por noche.',
     3000, 'room', true),

    (v_svc4_id, v_hotel_id, 'Traslado al aeropuerto',
     'Servicio de transfer privado al aeropuerto. Capacidad para 4 personas y equipaje.',
     6000, 'transport', true)
ON CONFLICT DO NOTHING;


-- =============================================================================
-- CONVERSACIÓN + MENSAJES DE PRUEBA para Carlos (habitación 101)
-- =============================================================================

INSERT INTO conversations (id, hotel_id, guest_id, reservation_id, channel, status)
VALUES (gen_random_uuid(), v_hotel_id, v_guest1_id, v_res1_id, 'chat', 'open')
ON CONFLICT DO NOTHING;

RAISE NOTICE '==============================================';
RAISE NOTICE 'Seed completado. Credenciales de prueba:';
RAISE NOTICE '';
RAISE NOTICE '  Hab. 101 — Apellido: Garcia   (Carlos García)';
RAISE NOTICE '  Hab. 205 — Apellido: Gonzalez (María González)';
RAISE NOTICE '  Hab. 310 — Apellido: Smith    (John Smith)';
RAISE NOTICE '';
RAISE NOTICE 'URL login: https://stormguest-app-nine.vercel.app/demo/login';
RAISE NOTICE '==============================================';

END $$;
