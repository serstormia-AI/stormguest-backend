const jwt = require('jsonwebtoken');
const { supabase } = require('../services/supabaseClient');

/**
 * Middleware de autenticación dual:
 * 1. Intenta verificar como Express JWT (firmado con JWT_SECRET) — legacy/fallback
 * 2. Si falla, verifica como Supabase JWT via auth.getUser() y resuelve
 *    role/hotel_id desde la tabla users usando auth_user_id
 *
 * El frontend almacena el Supabase access_token en localStorage.token
 * (ver StormGuestAuth.jsx performLogin), así que el path Supabase es el normal.
 */
const auth = (allowedRoles = []) => {
    return async (req, res, next) => {
        try {
            const authHeader = req.headers.authorization;
            const token = authHeader && authHeader.split(' ')[1];

            if (!token) {
                return res.status(401).json({ error: 'Acceso denegado: Token no proporcionado' });
            }

            let user;

            // --- Path 1: Express JWT (legacy) ---
            const secret = process.env.JWT_SECRET;
            if (secret) {
                try {
                    const decoded = jwt.verify(token, secret);
                    if (decoded.email && decoded.role) {
                        user = decoded;
                    }
                } catch {
                    // No es un Express JWT válido — continuar con Supabase JWT
                }
            }

            // --- Path 2: Supabase JWT ---
            if (!user) {
                const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);

                if (authError || !authUser) {
                    const message = authError?.message?.includes('expired') ? 'Token expirado' : 'Token inválido';
                    return res.status(401).json({ error: message });
                }

                // Resolver role y hotel_id desde la tabla users
                const { data: profile, error: profileError } = await supabase
                    .from('users')
                    .select('role, hotel_id, name, email')
                    .eq('auth_user_id', authUser.id)
                    .maybeSingle();

                if (profileError || !profile) {
                    return res.status(401).json({ error: 'Perfil de usuario no encontrado' });
                }

                user = {
                    email:        profile.email || authUser.email,
                    role:         profile.role,
                    hotel_id:     profile.hotel_id,
                    name:         profile.name,
                    auth_user_id: authUser.id,
                };
            }

            req.user = user;

            // Validación de rol
            if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
                return res.status(403).json({
                    error: `Acceso prohibido: Se requiere rol ${allowedRoles.join(' o ')}`
                });
            }

            next();
        } catch (error) {
            console.error('Auth middleware error:', error.message);
            res.status(401).json({ error: 'Token inválido' });
        }
    };
};

module.exports = auth;
