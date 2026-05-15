/**
 * scripts/verify-db.js
 * Connects to the database and prints a row-count summary for every table.
 * Usage: node scripts/verify-db.js
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const TABLES = [
    'hotels',
    'guests',
    'reservations',
    'conversations',
    'messages',
    'services',
    'reviews',
    'users',
];

async function verify() {
    const client = await pool.connect();
    try {
        console.log('\nStormGuest — DB Verification\n');
        console.log('Table                  | Rows');
        console.log('-----------------------+------');

        for (const table of TABLES) {
            try {
                const { rows } = await client.query(`SELECT COUNT(*) AS count FROM ${table}`);
                const count = rows[0].count.toString().padStart(5);
                console.log(`${table.padEnd(23)}| ${count}`);
            } catch (err) {
                console.log(`${table.padEnd(23)}| ERROR: ${err.message}`);
            }
        }

        console.log('\nDone.\n');
    } finally {
        client.release();
        await pool.end();
    }
}

verify().catch((err) => {
    console.error('Fatal error:', err.message);
    process.exit(1);
});
