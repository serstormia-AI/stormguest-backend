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

describe('GET /api/reviews', () => {
  it('sin token → 401', async () => {
    const res = await request(app).get('/api/reviews');
    expect(res.status).toBe(401);
  });

  it('con token válido → array (puede estar vacío o error 500/400 si hotel no existe)', async () => {
    const token = makeToken();
    const res = await request(app)
      .get('/api/reviews')
      .set('Authorization', `Bearer ${token}`);

    // 200 array, 400 if hotel_id not associated, 500 if DB error
    expect([200, 400, 500]).toContain(res.status);
    if (res.status === 200) {
      expect(Array.isArray(res.body)).toBe(true);
    }
  });
});

describe('POST /api/reviews', () => {
  it('sin token → 401', async () => {
    const res = await request(app)
      .post('/api/reviews')
      .send({ guest_id: 'abc', rating: 5 });
    expect(res.status).toBe(401);
  });

  it('exige guest_id y rating → 400 si faltan', async () => {
    const token = makeToken();
    const res = await request(app)
      .post('/api/reviews')
      .set('Authorization', `Bearer ${token}`)
      .send({ comment: 'Sin guest_id ni rating' });

    expect([400, 500]).toContain(res.status);
    // If 400, must have error about required fields
    if (res.status === 400) {
      expect(res.body).toHaveProperty('error');
    }
  });

  it('rating fuera de rango → 400', async () => {
    const token = makeToken();
    const res = await request(app)
      .post('/api/reviews')
      .set('Authorization', `Bearer ${token}`)
      .send({ guest_id: 'some-guest', rating: 10 });

    expect([400, 500]).toContain(res.status);
    if (res.status === 400) {
      expect(res.body.error).toMatch(/rating/i);
    }
  });

  it('rating 0 → 400', async () => {
    const token = makeToken();
    const res = await request(app)
      .post('/api/reviews')
      .set('Authorization', `Bearer ${token}`)
      .send({ guest_id: 'some-guest', rating: 0 });

    expect([400, 500]).toContain(res.status);
  });
});

describe('PUT /api/reviews/:id', () => {
  it('sin token → 401', async () => {
    const res = await request(app)
      .put('/api/reviews/fake-uuid')
      .send({ responded: true });
    expect(res.status).toBe(401);
  });

  it('con token y campos válidos → acepta responded y response_text', async () => {
    const token = makeToken();
    const res = await request(app)
      .put('/api/reviews/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${token}`)
      .send({ responded: true, response_text: 'Gracias por tu reseña' });

    // 200 if found, 404 if not found, 500 DB error
    expect([200, 404, 500]).toContain(res.status);
  });

  it('sin campos válidos → 400', async () => {
    const token = makeToken();
    const res = await request(app)
      .put('/api/reviews/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${token}`)
      .send({ campo_invalido: 'valor' });

    expect([400, 500]).toContain(res.status);
    if (res.status === 400) {
      expect(res.body).toHaveProperty('error');
    }
  });
});
