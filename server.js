require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initDb } = require('./database');

// Fix 5: Startup check — abort immediately if critical env vars are missing
const REQUIRED_ENV_VARS = ['JWT_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
const missingVars = REQUIRED_ENV_VARS.filter((v) => !process.env[v]);
if (missingVars.length > 0) {
    console.error(`ERROR FATAL: Las siguientes variables de entorno son requeridas y no están definidas:`);
    missingVars.forEach((v) => console.error(`  - ${v}`));
    process.exit(1);
}

// Import routes
const webhookRoutes = require('./routes/webhook');
const authRoutes = require('./routes/auth');
const hotelsRoutes = require('./routes/hotels');
const guestsRoutes = require('./routes/guests');
const analyticsRoutes = require('./routes/analytics');
const reservationsRoutes = require('./routes/reservations');
const servicesRoutes = require('./routes/services');
const reviewsRoutes = require('./routes/reviews');
const paymentsRoutes = require('./routes/payments');
const notificationsRoutes = require('./routes/notifications');

const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// Security: HTTP headers
app.use(helmet());

// Security: Rate limiters
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: 'Demasiadas solicitudes' }
});
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Demasiados intentos de login' }
});

// Fix 3: CORS restringido — leer orígenes desde variable de entorno
function buildCorsOrigins() {
    if (process.env.CORS_ORIGINS) {
        return process.env.CORS_ORIGINS.split(',').map((o) => o.trim());
    }
    if (process.env.NODE_ENV === 'production') {
        console.error('ERROR FATAL: NODE_ENV=production pero CORS_ORIGINS no está definida.');
        process.exit(1);
    }
    // Desarrollo: permitir orígenes locales comunes
    return ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:3001'];
}

const allowedOrigins = buildCorsOrigins();
console.log('CORS orígenes permitidos:', allowedOrigins);

app.use(cors({
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'apikey']
}));

// Security: Apply rate limiters (before routes)
app.use('/api/', generalLimiter);
app.use('/api/auth', authLimiter);

// Payments webhook must be registered before express.json() to receive raw body
app.use('/api/payments', paymentsRoutes);

// Security: Limit request body size to 1 MB
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/hotels', hotelsRoutes);
app.use('/api/guests', guestsRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/reservations', reservationsRoutes);
app.use('/api/services', servicesRoutes);
app.use('/api/reviews', reviewsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/settings', require('./routes/settings'));
app.use('/api/admin', require('./routes/admin'));
app.use('/webhook', webhookRoutes);
app.use('/api/webhook', webhookRoutes);

// Start Server
async function start() {
    // Rutas iniciales (antes de conectar a DB para debug)
    app.get('/health', (req, res) => {
        console.log('Health check requested');
        res.json({
            status: 'ok',
            db_status: 'checking...',
            timestamp: new Date()
        });
    });

    // Iniciar servidor primario
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Servidor base corriendo en http://0.0.0.0:${PORT}`);
    });

    try {
        // Iniciar Listener de Supabase Realtime para el ChatBot
        const { startChatBotListener } = require('./services/chatBot');
        startChatBotListener();

    } catch (error) {
        console.error('Error durante la inicialización de la DB:', error);
        if (error.stack) console.error(error.stack);
        // No matamos el proceso para que los logs sean visibles
    }
}

start();
