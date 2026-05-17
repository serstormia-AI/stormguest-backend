require('dotenv').config();
process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../server');

describe('GET /api/webhook/status', () => {
  it('→ { active: true }', async () => {
    const res = await request(app).get('/api/webhook/status');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('active', true);
  });
});

describe('POST /api/webhook/twilio', () => {
  it('sin body → procesa silenciosamente (200)', async () => {
    // NODE_ENV=test so Twilio signature check is skipped
    const res = await request(app)
      .post('/api/webhook/twilio')
      .send({});

    expect(res.status).toBe(200);
  });

  it('con body parcial (From sin Body) → 200 silencioso', async () => {
    const res = await request(app)
      .post('/api/webhook/twilio')
      .type('form')
      .send({ From: 'whatsapp:+5491100000000' });

    expect(res.status).toBe(200);
  });
});
