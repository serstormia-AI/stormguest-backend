const { pool } = require('./database');

async function testConn() {
  try {
    const res = await pool.query('SELECT current_schema(), current_database()');
    console.log('Connected to:', res.rows[0]);
    
    const tables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = $1
    `, [process.env.DB_SCHEMA || 'public']);
    
    console.log('Tables in schema:', tables.rows.map(t => t.table_name));
    process.exit(0);
  } catch (err) {
    console.error('Connection failed:', err.message);
    process.exit(1);
  }
}

testConn();
