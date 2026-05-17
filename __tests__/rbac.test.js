require('dotenv').config();
process.env.NODE_ENV = 'test';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');

function makeToken(role, hotel_id = 'test-hotel-00000000-0000-0000-0000-000000000000') {
  return jwt.sign(
    { id: 'test-user', role, hotel_id, name: 'Test User' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('RBAC — control de acceso por rol', () => {
  it('reception puede acceder a GET /api/settings (no hay bloqueo por rol aquí)', async () => {
    const token = makeToken('reception');
    const res = await request(app)
      .get('/api/settings')
      .set('Authorization', `Bearer ${token}`);

    // Settings doesn't enforce role restrictions beyond auth — 200/404/500 all valid
    expect([200, 404, 500]).toContain(res.status);
    // Should NOT be 403 (no role restriction on settings)
    expect(res.status).not.toBe(403);
  });

  it('hotel_manager no puede acceder a GET /api/admin/hotels → 403', async () => {
    const token = makeToken('hotel_manager');
    const res = await request(app)
      .get('/api/admin/hotels')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('reception no puede acceder a GET /api/admin/hotels → 403', async () => {
    const token = makeToken('reception');
    const res = await request(app)
      .get('/api/admin/hotels')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('super_admin puede acceder a GET /api/admin/hotels → 200 o 500 (DB)', async () => {
    const token = makeToken('super_admin');
    const res = await request(app)
      .get('/api/admin/hotels')
      .set('Authorization', `Bearer ${token}`);

    // 200 if DB available, 500 if not
    expect([200, 500]).toContain(res.status);
    // Should NOT be 401 or 403
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  it('sin token a /api/admin/hotels → 401', async () => {
    const res = await request(app).get('/api/admin/hotels');
    expect(res.status).toBe(401);
  });
});
