require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initDb } = require('./database');

// Import routes
const webhookRoutes = require('./routes/webhook');
const authRoutes = require('./routes/auth');
const hotelsRoutes = require('./routes/hotels');
const guestsRoutes = require('./routes/guests');
const analyticsRoutes = require('./routes/analytics');
const reservationsRoutes = require('./routes/reservations');
const servicesRoutes = require('./routes/services');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/hotels', hotelsRoutes);
app.use('/api/guests', guestsRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/reservations', reservationsRoutes);
app.use('/api/services', servicesRoutes);
app.use('/webhook', webhookRoutes);

// Start Server
async function start() {
    // Rutas iniciales (antes de conectar a DB para debug)
    app.get('/health', (req, res) => {
        console.log('🏥 Health check requested');
        res.json({
            status: 'ok',
            db_status: 'checking...',
            timestamp: new Date()
        });
    });

    // Iniciar servidor primario
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Servidor base corriendo en http://0.0.0.0:${PORT}`);
    });

    try {
        // Inicializar DB
        console.log('⏳ Intentando conectar a la base de datos...');
        await initDb();
        console.log('✅ Conexión a base de datos establecida.');

        // Inicializar Schedulers
        const { startSchedulers } = require('./services/scheduler');
        startSchedulers();

    } catch (error) {
        console.error('❌ Error durante la inicialización de la DB:', error);
        if (error.stack) console.error(error.stack);
        // No matamos el proceso para que los logs sean visibles
    }
}

start();
