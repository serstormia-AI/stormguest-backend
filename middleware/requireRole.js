/**
 * requireRole middleware
 * Usage: requireRole('super_admin') or requireRole('super_admin', 'hotel_manager')
 * Must be used AFTER auth() middleware so req.user is already set.
 */
module.exports = (...roles) => (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
        return res.status(403).json({ error: 'Acceso denegado' });
    }
    next();
};
