const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('connect', (client) => {
  client.query(`SET search_path TO ${process.env.DB_SCHEMA || 'public'}`);
});

async function initDb() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Create Hotels Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS hotels (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        location VARCHAR(255),
        phone VARCHAR(50),
        email VARCHAR(255),
        whatsapp_number VARCHAR(50),
        whatsapp_token VARCHAR(255),
        timezone VARCHAR(50) DEFAULT 'UTC',
        currency VARCHAR(10) DEFAULT 'USD',
        settings JSONB DEFAULT '{}',
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create Guests Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS guests (
        id SERIAL PRIMARY KEY,
        hotel_id VARCHAR(50) REFERENCES hotels(id),
        name VARCHAR(255),
        phone VARCHAR(50) NOT NULL,
        email VARCHAR(255),
        language VARCHAR(10) DEFAULT 'es',
        tags TEXT[] DEFAULT '{}',
        total_stays INTEGER DEFAULT 0,
        memory JSONB DEFAULT '{}',
        last_contact TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(hotel_id, phone)
      )
    `);

    // Create Reservations Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS reservations (
        id SERIAL PRIMARY KEY,
        hotel_id VARCHAR(50) REFERENCES hotels(id),
        guest_id INTEGER REFERENCES guests(id),
        room_number VARCHAR(50),
        room_type VARCHAR(100),
        check_in DATE NOT NULL,
        check_out DATE NOT NULL,
        adults INTEGER DEFAULT 1,
        children INTEGER DEFAULT 0,
        status VARCHAR(50) DEFAULT 'confirmed',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create Conversations Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id SERIAL PRIMARY KEY,
        hotel_id VARCHAR(50) REFERENCES hotels(id),
        guest_id INTEGER REFERENCES guests(id),
        reservation_id INTEGER REFERENCES reservations(id),
        status VARCHAR(50) DEFAULT 'new',
        stage VARCHAR(50) DEFAULT 'inquiry',
        column_name VARCHAR(50) DEFAULT 'Nuevo',
        last_message TEXT,
        last_message_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create Messages Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        conversation_id INTEGER REFERENCES conversations(id),
        role VARCHAR(50) NOT NULL, -- 'user' or 'assistant'
        content TEXT NOT NULL,
        whatsapp_message_id VARCHAR(255),
        media_url TEXT,
        media_type VARCHAR(50),
        tokens_used INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create Services Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS services (
        id SERIAL PRIMARY KEY,
        hotel_id VARCHAR(50) REFERENCES hotels(id),
        name VARCHAR(255) NOT NULL,
        price DECIMAL(10,2) DEFAULT 0,
        category VARCHAR(50), -- 'pre_stay', 'during_stay', 'checkout'
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create Reviews Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS reviews (
        id SERIAL PRIMARY KEY,
        hotel_id VARCHAR(50) REFERENCES hotels(id),
        guest_id INTEGER REFERENCES guests(id),
        reservation_id INTEGER REFERENCES reservations(id),
        sentiment VARCHAR(50),
        google_review_requested BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(reservation_id)
      )
    `);

    await client.query('COMMIT');
    console.log('✅ Base de datos inicializada correctamente');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('❌ Error inicializando DB:', e);
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { pool, initDb };
