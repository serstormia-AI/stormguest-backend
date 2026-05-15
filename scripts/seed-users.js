/**
 * seed-users.js
 * Creates demo users in the `users` table with bcrypt-hashed passwords.
 * Safe to run multiple times — uses INSERT ... ON CONFLICT DO NOTHING.
 *
 * Usage: node scripts/seed-users.js
 */

require('dotenv').config();
const bcrypt = require('bcrypt');
const { pool } = require('../database');

const SALT_ROUNDS = 12;

const DEMO_USERS = [
    {
        email: 'admin@stormguest.com',
        password: 'Storm2024!',
        role: 'super_admin',
        hotel_id: null,
        name: 'Admin StormGuest',
    },
    {
        email: 'manager@vain.com',
        password: 'Hotel2024!',
        role: 'hotel_manager',
        hotel_id: 'vain',
        name: 'Manager Vain Hotel',
    },
    {
        email: 'recepcion@vain.com',
        password: 'Recep2024!',
        role: 'reception',
        hotel_id: 'vain',
        name: 'Recepción Vain Hotel',
    },
];

async function seedUsers() {
    const client = await pool.connect();
    try {
        console.log('Seeding demo users...\n');

        for (const user of DEMO_USERS) {
            const passwordHash = await bcrypt.hash(user.password, SALT_ROUNDS);

            const result = await client.query(
                `INSERT INTO users (email, password_hash, role, hotel_id, name)
                 VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT (email) DO NOTHING
                 RETURNING id, email, role`,
                [user.email, passwordHash, user.role, user.hotel_id, user.name]
            );

            if (result.rowCount > 0) {
                const row = result.rows[0];
                console.log(`  ✓ Inserted: ${row.email} (id=${row.id}, role=${row.role})`);
            } else {
                console.log(`  — Skipped (already exists): ${user.email}`);
            }
        }

        console.log('\nDone.');
    } catch (err) {
        console.error('Seed failed:', err.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

seedUsers();
