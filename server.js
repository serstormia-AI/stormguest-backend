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
app.use('/webhook', webhookRoutes); // As defined in the README_1.md: POST /webhook

// Health Check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start Server
async function start() {
    try {
        // Optionally init DB on start (in prod run independently)
        await initDb();

        // Check if scheduler is requested
        const { startSchedulers } = require('./services/scheduler');
        startSchedulers();

        // Rutas iniciales
        app.get('/health', (req, res) => {
            console.log('🏥 Health check requested');
            res.json({ status: 'ok', timestamp: new Date() });
        });

        app.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 Servidor corriendo en http://0.0.0.0:${PORT}`);
        });
    } catch (error) {
        console.error('❌ Error fatal al iniciar servidor:', error);
        // Mostrar más detalles del error si es posible
        if (error.stack) console.error(error.stack);
        process.exit(1);
    }
}

start();
