const jwt = require('jsonwebtoken');
const axios = require('axios');

async function test() {
    const token = jwt.sign(
        { email: 'admin@serstorm.com', role: 'super_admin' },
        'stormguest_secret_123',
        { expiresIn: '24h' }
    );

    try {
        const res = await axios.post('http://localhost:3001/api/hotels', {
            name: "Test Hotel",
            location: "Test Location",
            whatsapp: "12345678",
            plan: "pro",
            provider: "evolution",
            evolution_url: "http://evolution.com",
            evolution_apikey: "123",
            upsell_prices: {}
        }, {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log("Success:", res.data);
    } catch (e) {
        console.error("Error Status:", e.response?.status);
        console.error("Error Data:", e.response?.data);
    }
}

test();
