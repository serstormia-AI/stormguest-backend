const express = require('express');
const { supabase } = require('../services/supabaseClient');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const bcrypt = require('bcrypt');

const router = express.Router();

// All routes require auth + super_admin role
router.use(auth(), requireRole('super_admin'));

// ─── HOTELS ────────────────────────────────────────────────────────────────

// GET /api/admin/hotels — list all hotels with user count and guest count
router.get('/hotels', async (req, res) => {
    try {
        const { data: hotels, error } = await supabase
            .from('hotels')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) return res.status(500).json({ error: error.message });

        // Enrich with user and guest counts
        const enriched = await Promise.all(hotels.map(async (hotel) => {
            const [{ count: userCount }, { count: guestCount }] = await Promise.all([
                supabase
                    .from('users')
                    .select('id', { count: 'exact', head: true })
                    .eq('hotel_id', hotel.id),
                supabase
                    .from('guests')
                    .select('id', { count: 'exact', head: true })
                    .eq('hotel_id', hotel.id),
            ]);

            return {
                ...hotel,
                user_count: userCount || 0,
                guest_count: guestCount || 0,
            };
        }));

        res.json(enriched);
    } catch (err) {
        console.error('[admin GET /hotels]', err.message);
        res.status(500).json({ error: 'Error interno' });
    }
});

// POST /api/admin/hotels — create hotel
router.post('/hotels', async (req, res) => {
    try {
        const { name, slug } = req.body;

        if (!name || typeof name !== 'string' || !name.trim()) {
            return res.status(400).json({ error: 'El campo name es requerido' });
        }
        if (!slug || typeof slug !== 'string' || !slug.trim()) {
            return res.status(400).json({ error: 'El campo slug es requerido' });
        }

        const cleanSlug = slug.trim().toLowerCase().replace(/\s+/g, '-');

        const { data, error } = await supabase
            .from('hotels')
            .insert({ name: name.trim(), slug: cleanSlug, active: true })
            .select()
            .single();

        if (error) return res.status(500).json({ error: error.message });
        res.status(201).json(data);
    } catch (err) {
        console.error('[admin POST /hotels]', err.message);
        res.status(500).json({ error: 'Error interno' });
    }
});

// PUT /api/admin/hotels/:id — edit hotel
router.put('/hotels/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, slug } = req.body;

        const updates = {};
        if (name !== undefined) updates.name = name.trim();
        if (slug !== undefined) updates.slug = slug.trim().toLowerCase().replace(/\s+/g, '-');

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ error: 'No hay campos para actualizar' });
        }

        const { data, error } = await supabase
            .from('hotels')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) return res.status(500).json({ error: error.message });
        if (!data) return res.status(404).json({ error: 'Hotel no encontrado' });
        res.json(data);
    } catch (err) {
        console.error('[admin PUT /hotels/:id]', err.message);
        res.status(500).json({ error: 'Error interno' });
    }
});

// DELETE /api/admin/hotels/:id — delete hotel (only if no active users)
router.delete('/hotels/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const { count: userCount, error: countErr } = await supabase
            .from('users')
            .select('id', { count: 'exact', head: true })
            .eq('hotel_id', id);

        if (countErr) return res.status(500).json({ error: countErr.message });

        if (userCount > 0) {
            return res.status(409).json({
                error: `No se puede eliminar: el hotel tiene ${userCount} usuario(s) activo(s). Elimínalos primero.`
            });
        }

        const { error } = await supabase
            .from('hotels')
            .delete()
            .eq('id', id);

        if (error) return res.status(500).json({ error: error.message });
        res.json({ message: 'Hotel eliminado correctamente' });
    } catch (err) {
        console.error('[admin DELETE /hotels/:id]', err.message);
        res.status(500).json({ error: 'Error interno' });
    }
});

// ─── USERS ─────────────────────────────────────────────────────────────────

// GET /api/admin/users — list all users across all hotels
router.get('/users', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('id, name, email, role, hotel_id, created_at')
            .order('created_at', { ascending: false });

        if (error) return res.status(500).json({ error: error.message });
        res.json(data);
    } catch (err) {
        console.error('[admin GET /users]', err.message);
        res.status(500).json({ error: 'Error interno' });
    }
});

// POST /api/admin/users — create user
router.post('/users', async (req, res) => {
    try {
        const { name, email, password, role, hotel_id } = req.body;

        if (!name || !email || !password || !role) {
            return res.status(400).json({ error: 'name, email, password y role son requeridos' });
        }

        const ALLOWED_ROLES = ['hotel_manager', 'reception'];
        if (!ALLOWED_ROLES.includes(role)) {
            return res.status(400).json({ error: 'role debe ser hotel_manager o reception' });
        }

        if (!email.includes('@')) {
            return res.status(400).json({ error: 'Email inválido' });
        }

        const password_hash = await bcrypt.hash(password, 10);

        const { data, error } = await supabase
            .from('users')
            .insert({
                name: name.trim(),
                email: email.trim().toLowerCase(),
                password_hash,
                role,
                hotel_id: hotel_id || null,
            })
            .select('id, name, email, role, hotel_id, created_at')
            .single();

        if (error) {
            if (error.message.includes('unique') || error.code === '23505') {
                return res.status(409).json({ error: 'Ya existe un usuario con ese email' });
            }
            return res.status(500).json({ error: error.message });
        }

        res.status(201).json(data);
    } catch (err) {
        console.error('[admin POST /users]', err.message);
        res.status(500).json({ error: 'Error interno' });
    }
});

// PUT /api/admin/users/:id — edit user
router.put('/users/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, email, password, role, hotel_id } = req.body;

        const ALLOWED_ROLES = ['hotel_manager', 'reception'];
        const updates = {};

        if (name !== undefined) updates.name = name.trim();
        if (email !== undefined) updates.email = email.trim().toLowerCase();
        if (role !== undefined) {
            if (!ALLOWED_ROLES.includes(role)) {
                return res.status(400).json({ error: 'role debe ser hotel_manager o reception' });
            }
            updates.role = role;
        }
        if (hotel_id !== undefined) updates.hotel_id = hotel_id || null;
        if (password && password.trim()) {
            updates.password_hash = await bcrypt.hash(password, 10);
        }

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ error: 'No hay campos para actualizar' });
        }

        const { data, error } = await supabase
            .from('users')
            .update(updates)
            .eq('id', id)
            .select('id, name, email, role, hotel_id, created_at')
            .single();

        if (error) return res.status(500).json({ error: error.message });
        if (!data) return res.status(404).json({ error: 'Usuario no encontrado' });
        res.json(data);
    } catch (err) {
        console.error('[admin PUT /users/:id]', err.message);
        res.status(500).json({ error: 'Error interno' });
    }
});

// DELETE /api/admin/users/:id — delete user
router.delete('/users/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const { error } = await supabase
            .from('users')
            .delete()
            .eq('id', id);

        if (error) return res.status(500).json({ error: error.message });
        res.json({ message: 'Usuario eliminado correctamente' });
    } catch (err) {
        console.error('[admin DELETE /users/:id]', err.message);
        res.status(500).json({ error: 'Error interno' });
    }
});

module.exports = router;
