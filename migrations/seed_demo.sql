-- =============================================================================
-- StormGuest — Seed demo para Hotel Demo
-- Ejecutar en Supabase SQL Editor
-- Login: habitación + nombre completo (el campo es 'name')
-- =============================================================================

DO $$
DECLARE
    v_hotel_id UUID := '0600c026-3568-4507-a646-dbe273a5f624';
    v_guest1_id UUID := gen_random_uuid();
    v_guest2_id UUID := gen_random_uuid();
    v_guest3_id UUID := gen_random_uuid();
    v_res1_id UUID := gen_random_uuid();
    v_res2_id UUID := gen_random_uuid();
    v_res3_id UUID := gen_random_uuid();
BEGIN

-- HUÉSPEDES
INSERT INTO guests (id, hotel_id, name, email, phone)
VALUES
    (v_guest1_id, v_hotel_id, 'Carlos Garcia',   'carlos.garcia@email.com',  '+54911111111'),
    (v_guest2_id, v_hotel_id, 'Maria Gonzalez',  'maria.gonzalez@email.com', '+54922222222'),
    (v_guest3_id, v_hotel_id, 'John Smith',       'john.smith@email.com',     '+19735551234')
ON CONFLICT DO NOTHING;

-- RESERVAS
INSERT INTO reservations (id, hotel_id, guest_id, room_number, check_in, check_out, status)
VALUES
    (v_res1_id, v_hotel_id, v_guest1_id, '101', CURRENT_DATE,     CURRENT_DATE + 5, 'checked_in'),
    (v_res2_id, v_hotel_id, v_guest2_id, '205', CURRENT_DATE - 1, CURRENT_DATE + 3, 'checked_in'),
    (v_res3_id, v_hotel_id, v_guest3_id, '310', CURRENT_DATE + 1, CURRENT_DATE + 7, 'confirmed')
ON CONFLICT DO NOTHING;

-- EXPERIENCIAS (catálogo visible en la app de huéspedes)
INSERT INTO experiences (id, hotel_id, title, description, price, image_url)
VALUES
    (gen_random_uuid(), v_hotel_id,
     'Desayuno en habitación',
     'Desayuno completo con café, medialunas y jugo fresco. Hasta las 11hs.',
     2500, ''),

    (gen_random_uuid(), v_hotel_id,
     'Masaje relax 60 min',
     'Masaje de cuerpo completo en nuestro spa. Incluye aromaterapia.',
     8500, ''),

    (gen_random_uuid(), v_hotel_id,
     'Late Check-out',
     'Extendé tu estadía hasta las 15hs.',
     3000, ''),

    (gen_random_uuid(), v_hotel_id,
     'Traslado al aeropuerto',
     'Transfer privado. Capacidad 4 personas + equipaje.',
     6000, '')
ON CONFLICT DO NOTHING;

-- CONVERSACIÓN inicial para Carlos
INSERT INTO conversations (id, hotel_id, guest_id, reservation_id, channel, status)
VALUES (gen_random_uuid(), v_hotel_id, v_guest1_id, v_res1_id, 'chat', 'open')
ON CONFLICT DO NOTHING;

RAISE NOTICE 'Seed OK — credenciales de prueba:';
RAISE NOTICE '  Hab 101 - Garcia    (Carlos Garcia)';
RAISE NOTICE '  Hab 205 - Gonzalez  (Maria Gonzalez)';
RAISE NOTICE '  Hab 310 - Smith     (John Smith)';

END $$;
