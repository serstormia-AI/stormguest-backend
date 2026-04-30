const { pool } = require('./database');
async function run() {
  try {
    const res = await pool.query(`SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_name IN ('requests', 'experiences') AND table_schema = current_schema();`);
    console.log(JSON.stringify(res.rows, null, 2));
  } catch(e) {
    console.error(e);
  } finally {
    process.exit();
  }
}
run();
