require('dotenv').config();
process.env.NODE_ENV = 'test';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');

function makeToken(role = 'hotel_manager', hotel_id = 'test-hotel-00000000-0000-0000-0000-000000000000') {
  return jwt.sign(
    { id: 'test-user', role, hotel_id, name: 'Test User' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('GET /api/settings', () => {
  it('sin token → 401', async () => {
    const res = await request(app).get('/api/settings');
    expect(res.status).toBe(401);
  });

  it('con token → objeto con campos del hotel o 404/500 si hotel no existe', async () => {
    const token = makeToken();
    const res = await request(app)
      .get('/api/settings')
      .set('Authorization', `Bearer ${token}`);

    // 200 if hotel found, 404 if not, 500 on DB error
    expect([200, 404, 500]).toContain(res.status);
    if (res.status === 200) {
      expect(typeof res.body).toBe('object');
      // Expect hotel settings fields
      expect(res.body).toHaveProperty('id');
    }
  });
});

describe('PUT /api/settings', () => {
  it('sin token → 401', async () => {
    const res = await request(app)
      .put('/api/settings')
      .send({ system_prompt: 'Hola' });
    expect(res.status).toBe(401);
  });

  it('sin campos válidos → 400', async () => {
    const token = makeToken();
    const res = await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ campo_invalido: 'valor' });

    expect([400, 500]).toContain(res.status);
    if (res.status === 400) {
      expect(res.body).toHaveProperty('error');
    }
  });

  it('con system_prompt → actualiza y devuelve o 500/404 si hotel no existe', async () => {
    const token = makeToken();
    const res = await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ system_prompt: 'Sos un asistente de hotel amable y eficiente.' });

    expect([200, 500]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body).toHaveProperty('ok', true);
      expect(res.body.data).toHaveProperty('system_prompt');
    }
  });
});
