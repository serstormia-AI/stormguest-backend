const jwt = require('jsonwebtoken');

/**
 * Middleware de Autenticación JWT
 * Verifica el token y permite opcionalmente validar roles específicos
 * @param {Array} allowedRoles - Roles opcionalmente permitidos (ej: ['admin', 'manager'])
 */
const auth = (allowedRoles = []) => {
    return (req, res, next) => {
        try {
            const authHeader = req.headers.authorization;
            const token = authHeader && authHeader.split(' ')[1];

            if (!token) {
                return res.status(401).json({ error: 'Acceso denegado: Token no proporcionado' });
            }

            const secret = process.env.JWT_SECRET;
            if (!secret) {
                console.error('FATAL: JWT_SECRET no está definido');
                return res.status(500).json({ error: 'Error de configuración del servidor' });
            }
            const decoded = jwt.verify(token, secret);
            req.user = decoded;

            // Validación de Roles (si se especifican)
            if (allowedRoles.length > 0 && !allowedRoles.includes(decoded.role)) {
                return res.status(403).json({ 
                    error: `Acceso prohibido: Se requiere rol ${allowedRoles.join(' o ')}` 
                });
            }

            next();
        } catch (error) {
            console.error('Auth middleware error:', error.message);
            const message = error.name === 'TokenExpiredError' ? 'Token expirado' : 'Token inválido';
            res.status(401).json({ error: message });
        }
    };
};

module.exports = auth;
