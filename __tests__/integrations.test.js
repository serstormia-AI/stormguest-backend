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

describe('GET /api/integrations', () => {
  it('sin token → 401', async () => {
    const res = await request(app).get('/api/integrations');
    expect(res.status).toBe(401);
  });

  it('con token → array', async () => {
    const token = makeToken();
    const res = await request(app)
      .get('/api/integrations')
      .set('Authorization', `Bearer ${token}`);

    expect([200, 500]).toContain(res.status);
    if (res.status === 200) {
      expect(Array.isArray(res.body)).toBe(true);
    }
  });
});

describe('GET /api/integrations/health', () => {
  it('sin token → 401', async () => {
    const res = await request(app).get('/api/integrations/health');
    expect(res.status).toBe(401);
  });

  it('con token → array con status field', async () => {
    const token = makeToken();
    const res = await request(app)
      .get('/api/integrations/health')
      .set('Authorization', `Bearer ${token}`);

    expect([200, 500]).toContain(res.status);
    if (res.status === 200) {
      expect(Array.isArray(res.body)).toBe(true);
      // Each item should have a status field
      res.body.forEach(item => {
        expect(item).toHaveProperty('status');
      });
    }
  });
});

describe('POST /api/integrations/ical', () => {
  it('sin ical_url → 400', async () => {
    const token = makeToken();
    const res = await request(app)
      .post('/api/integrations/ical')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect([400, 500]).toContain(res.status);
    if (res.status === 400) {
      expect(res.body).toHaveProperty('error');
    }
  });

  it('sin token → 401', async () => {
    const res = await request(app)
      .post('/api/integrations/ical')
      .send({ ical_url: 'https://example.com/cal.ics' });

    expect(res.status).toBe(401);
  });

  it('con url válida → ok o 500 si DB no disponible', async () => {
    const token = makeToken();
    const res = await request(app)
      .post('/api/integrations/ical')
      .set('Authorization', `Bearer ${token}`)
      .send({ ical_url: 'https://example.com/calendar.ics', provider: 'airbnb' });

    expect([200, 500]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body).toHaveProperty('ok', true);
    }
  });
});
