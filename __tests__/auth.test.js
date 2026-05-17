require('dotenv').config();
process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../server');

describe('POST /api/auth/login', () => {
  it('con credenciales válidas → token JWT o 401 si no existe el usuario', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'demo@stormguest.com', password: 'demo123' });

    // Either 200 with token, or 401 if user doesn't exist in DB
    expect([200, 401]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body).toHaveProperty('token');
      expect(typeof res.body.token).toBe('string');
    }
  });

  it('con credenciales inválidas → 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'noexiste@stormguest.com', password: 'wrongpassword' });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  it('sin body → 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('sin email → 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: 'algo' });

    expect(res.status).toBe(400);
  });

  it('sin password → 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'demo@stormguest.com' });

    expect(res.status).toBe(400);
  });
});
