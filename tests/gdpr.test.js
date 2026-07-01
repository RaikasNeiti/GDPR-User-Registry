require('dotenv').config({ path: '.env.test' });
const request = require('supertest');

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 
  'postgresql://gdpr_user:gdpr_password@localhost:5432/gdpr_registry_test';

const { cleanDatabase, closeDatabase } = require('./helpers/testSetup');

let token, userId;

const testUser = {
  firstName: 'Maija',
  lastName: 'Virtanen',
  email: 'maija@example.com',
  password: 'Salasana123',
  acceptTerms: true,
  acceptPrivacy: true
};

const { app, initForTests } = require('../server');

beforeAll(async () => {
  await initForTests();
  await cleanDatabase();

  // Rekisteröi testikäyttäjä
  const res = await request(app)
    .post('/api/auth/register')
    .send(testUser);
  
  //console.log('REGISTER RESPONSE:', res.status, JSON.stringify(res.body));

  token = res.body.token;
  userId = res.body.user.id;
});

afterAll(async () => {
  await cleanDatabase();
  await closeDatabase();
});

describe('GDPR Article 15 — Right to Access', () => {
  test('käyttäjä voi hakea omat tietonsa', async () => {
    const res = await request(app)
      .get(`/api/user/${userId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.email).toBe(testUser.email);
    expect(res.body.firstName).toBe(testUser.firstName);
  });

  test('estää toisen käyttäjän tietojen hakemisen', async () => {
    const res = await request(app)
      .get('/api/user/toinen-kayttaja-id')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  test('estää pääsyn ilman tokenia', async () => {
    const res = await request(app)
      .get(`/api/user/${userId}`);

    expect(res.status).toBe(401);
  });
});

describe('GDPR Article 16 — Right to Rectification', () => {
  test('käyttäjä voi päivittää tietojaan', async () => {
    const res = await request(app)
      .put(`/api/user/${userId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'MaijaUusi', lastName: 'VirtanenUusi' });

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('updated');
  });
});

describe('GDPR Article 20 — Right to Data Portability', () => {
  test('käyttäjä voi exportata omat tietonsa', async () => {
    const res = await request(app)
      .post('/api/dsar/export')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.userProfile).toBeDefined();
    expect(res.body.consentHistory).toBeDefined();
    expect(res.body.activityLog).toBeDefined();
    expect(res.body.exportDate).toBeDefined();
    // Varmista että data on luettavaa (ei salattu)
    expect(res.body.userProfile.email).toBe(testUser.email);
  });
});

describe('GDPR Article 17 — Right to Erasure', () => {
  test('käyttäjä voi pyytää tilin poistoa', async () => {
    const res = await request(app)
      .post('/api/deletion/request')
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Testi' });

    expect(res.status).toBe(200);
    expect(res.body.deletionScheduledFor).toBeDefined();
    expect(res.body.message).toContain('30 days');
  });

  test('käyttäjä voi peruuttaa poistopyynnön', async () => {
    // Pyydä ensin poistoa
    await request(app)
      .post('/api/deletion/request')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    // Peruuta pyyntö
    const res = await request(app)
      .post('/api/deletion/cancel')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('cancelled');
  });
});

describe('Audit log', () => {
  test('käyttäjä voi nähdä oman aktiviteettilokinsa', async () => {
    const res = await request(app)
      .get(`/api/audit-log/${userId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('consent historia tallennetaan rekisteröinnissä', async () => {
    const res = await request(app)
      .get(`/api/consent-history/${userId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
    const types = res.body.map(c => c.consent_type);
    expect(types).toContain('terms');
    expect(types).toContain('privacy');
  });
});