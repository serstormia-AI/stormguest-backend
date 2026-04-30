const dotenv = require('dotenv');
dotenv.config();

async function test() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const res = await fetch(`${supabaseUrl}/rest/v1/requests?select=*&limit=1`, {
    headers: {
      'apikey': anonKey,
      'Authorization': `Bearer ${anonKey}`,
      'Accept-Profile': 'stormguest'
    }
  });

  const data = await res.json();
  console.log("REQUESTS:", JSON.stringify(data, null, 2));

  const resExp = await fetch(`${supabaseUrl}/rest/v1/experiences?select=*&limit=1`, {
    headers: {
      'apikey': anonKey,
      'Authorization': `Bearer ${anonKey}`,
      'Accept-Profile': 'stormguest'
    }
  });

  const expData = await resExp.json();
  console.log("EXPERIENCES:", JSON.stringify(expData, null, 2));
}

test().catch(console.error);
