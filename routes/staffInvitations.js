const express = require('express');
const { supabase } = require('../services/supabaseClient');
const auth = require('../middleware/auth');

const router = express.Router();

const INVITABLE_ROLES = ['hotel_manager', 'reception', 'housekeeping', 'gastronomy'];

// POST /api/staff/invitations
// Solo hotel_manager. Invita a un usuario nuevo al hotel propio vía Supabase Auth.
// hotel_id viene del JWT — nunca del body.
router.post('/invitations', auth(['hotel_manager']), async (req, res) => {
    const { email, role, name } = req.body;
    const { hotel_id, email: managerEmail } = req.user;

    if (!email || typeof email !== 'string' || !email.includes('@')) {
        return res.status(400).json({ error: 'Email inválido' });
    }
    if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'El nombre es requerido' });
    }
    if (!INVITABLE_ROLES.includes(role)) {
        return res.status(400).json({ error: 'Rol inválido' });
    }
    if (!hotel_id) {
        return res.status(400).json({ error: 'El manager no tiene hotel asignado' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedName  = name.trim();

    try {
        // 1. Verificar duplicado en users ANTES de llamar a Supabase Auth
        const { data: existing } = await supabase
            .from('users')
            .select('id')
            .eq('email', normalizedEmail)
            .maybeSingle();

        if (existing) {
            return res.status(409).json({ error: 'Ya existe un usuario con ese email' });
        }

        // 2. Invitar por email — Supabase envía el email automáticamente
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        const { data: { user: authUser }, error: authErr } = await supabase.auth.admin.inviteUserByEmail(
            normalizedEmail,
            {
                data: { name: normalizedName, role, hotel_id },
                redirectTo: `${frontendUrl}/reset-password`,
            }
        );

        if (authErr) {
            if (authErr.message.toLowerCase().includes('already')) {
                return res.status(409).json({ error: 'Ya existe un usuario con ese email' });
            }
            console.error('inviteUserByEmail error:', authErr.message);
            return res.status(500).json({ error: 'Error al enviar la invitación' });
        }

        const authUserId = authUser.id;

        // 3. Insertar en users — mismo patrón que SuperAdmin.jsx
        const { error: profileErr } = await supabase.from('users').insert({
            name:          normalizedName,
            email:         normalizedEmail,
            password_hash: 'supabase_auth',
            role,
            hotel_id,
            auth_user_id:  authUserId,
        });

        if (profileErr) {
            // Rollback: eliminar el usuario de Auth que acabamos de crear
            await supabase.auth.admin.deleteUser(authUserId).catch((e) => {
                console.error('Rollback deleteUser failed:', e.message);
            });
            console.error('users insert error:', profileErr.message);
            if (profileErr.code === '23505') {
                return res.status(409).json({ error: 'Ya existe un usuario con ese email' });
            }
            return res.status(500).json({ error: 'Error al crear el perfil del usuario' });
        }

        // 4. Audit log — fire-and-forget, no afecta la respuesta
        supabase.from('staff_invitations').insert({
            hotel_id,
            email:            normalizedEmail,
            role,
            invited_by_email: managerEmail || null,
            auth_user_id:     authUserId,
        }).then(({ error: auditErr }) => {
            if (auditErr) console.error('Audit log insert failed:', auditErr.message);
        });

        return res.status(201).json({
            ok:      true,
            message: `Invitación enviada a ${normalizedEmail}`,
        });
    } catch (err) {
        console.error('staff invitation unexpected error:', err);
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
});

module.exports = router;
