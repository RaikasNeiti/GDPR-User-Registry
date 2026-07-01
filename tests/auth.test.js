require('dotenv').config({ path: '.env.test' });
const request = require('supertest');

// Mock Vault ennen server importtia
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 
  'postgresql://gdpr_user:gdpr_password@localhost:5432/gdpr_registry_test';

const { cleanDatabase } = require('./helpers/testSetup');

const { app, initForTests } = require('../server');

beforeAll(async () => {
  await initForTests();
  await cleanDatabase();
});

afterAll(async () => {
  const { closeDatabase } = require('./helpers/testSetup');
  await closeDatabase();
});

afterEach(async () => {
  await cleanDatabase();
});

describe('POST /api/auth/register', () => {
  const validUser = {
    firstName: 'Matti',
    lastName: 'Meikäläinen',
    email: 'matti@example.com',
    password: 'Salasana123',
    acceptTerms: true,
    acceptPrivacy: true
  };

  test('rekisteröi uuden käyttäjän onnistuneesti', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send(validUser);

    expect(res.status).toBe(201);
    expect(res.body.message).toBe('Registration successful');
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe(validUser.email);
    // Varmista että salasana ei palaudu
    expect(res.body.user.password).toBeUndefined();
    expect(res.body.user.password_hash).toBeUndefined();
  });

  test('hylkää rekisteröinnin ilman pakollisia kenttiä', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'test@test.com', password: 'Salasana123' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  test('hylkää virheellisen sähköpostiosoitteen', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validUser, email: 'ei-validi-email' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('email');
  });

  test('hylkää liian lyhyen salasanan', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validUser, password: 'lyhyt' });

    expect(res.status).toBe(400);
  });

  test('hylkää rekisteröinnin ilman ehtojen hyväksyntää', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validUser, acceptTerms: false });

    expect(res.status).toBe(400);
  });

  test('hylkää duplikaatti sähköpostiosoitteen', async () => {
    await request(app).post('/api/auth/register').send(validUser);
    const res = await request(app).post('/api/auth/register').send(validUser);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('registered');
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await request(app).post('/api/auth/register').send({
      firstName: 'Matti',
      lastName: 'Meikäläinen',
      email: 'matti@example.com',
      password: 'Salasana123',
      acceptTerms: true,
      acceptPrivacy: true
    });
  });

  test('kirjautuu sisään oikeilla tunnuksilla', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'matti@example.com', password: 'Salasana123' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe('matti@example.com');
  });

  test('hylkää väärän salasanan', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'matti@example.com', password: 'VääräSalasana' });

    expect(res.status).toBe(401);
  });

  test('hylkää olemattoman käyttäjän', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'eitole@example.com', password: 'Salasana123' });

    expect(res.status).toBe(401);
  });

  test('hylkää kirjautumisen ilman tunnuksia', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({});

    expect(res.status).toBe(400);
  });
});