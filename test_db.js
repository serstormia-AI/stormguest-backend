const { pool } = require('./database');

async function test() {
  try {
    console.log('--- Testing DB connection ---');
    const schemaRes = await pool.query('SELECT current_schema();');
    console.log('Current Schema:', schemaRes.rows[0]);

    console.log('\n--- Checking tables ---');
    const tableRes = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = current_schema();
    `);
    console.log('Tables in current schema:', tableRes.rows.map(r => r.table_name).join(', ') || 'NONE');

    if (tableRes.rows.some(r => r.table_name === 'hotels')) {
      console.log('\n--- Checking hotels columns ---');
      const columnsRes = await pool.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'hotels';
      `);
      columnsRes.rows.forEach(c => console.log(` - ${c.column_name}: ${c.data_type}`));
    } else {
      console.error('\n❌ ERROR: hotels table not found in current schema.');
    }

    process.exit(0);
  } catch (err) {
    console.error('\n❌ DB Error:', err.message);
    if (err.message.includes('ECONNREFUSED')) {
      console.error('Check if SSH TUNNEL is active: ssh -L 5432:10.0.3.6:5432 root@31.97.94.166 -N');
    }
    process.exit(1);
  }
}

test();
