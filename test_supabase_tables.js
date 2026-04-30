const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log("Checking tables in public schema...");
  
  const { data: mData, error: mErr } = await supabase.from('messages').select('*').limit(1);
  console.log("MESSAGES:", mErr ? mErr.message : "Exists! Sample: " + JSON.stringify(mData));

  const { data: rData, error: rErr } = await supabase.from('requests').select('*').limit(1);
  console.log("REQUESTS:", rErr ? rErr.message : "Exists! Sample: " + JSON.stringify(rData));

  const { data: eData, error: eErr } = await supabase.from('experiences').select('*').limit(1);
  console.log("EXPERIENCES:", eErr ? eErr.message : "Exists! Sample: " + JSON.stringify(eData));
}

run();
