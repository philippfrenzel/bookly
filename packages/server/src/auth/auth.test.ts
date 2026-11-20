/** Integration tests for account registration, login, logout and session lookup. */
import { describe, expect, test } from 'vitest';
import { eq } from 'drizzle-orm';
import { testApp, registeredAgent } from '../test/helpers.js';
import { createDb } from '../db/client.js';
import { sessions, users } from '../db/schema.js';

const body = { email: 'Autor@Example.de', password: 'geheimes-passwort', displayName: 'Autor' };

describe('auth', () => {
  test('register then me returns user', async () => {
    const app = await testApp();
    const res = await app.inject({ method: 'POST', url: '/api/auth/register', payload: body });
    expect(res.statusCode).toBe(201);
    expect(res.json().user).toMatchObject({ email: 'autor@example.de', displayName: 'Autor' });
    const cookie = `sid=${res.cookies.find((c) => c.name === 'sid')!.value}`;
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.email).toBe('autor@example.de');
    await app.close();
  });

  test('duplicate email is 409', async () => {
    const app = await testApp();
    await app.inject({ method: 'POST', url: '/api/auth/register', payload: body });
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { ...body, email: 'AUTOR@example.de' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: 'email_taken' });
    await app.close();
  });

  test('invalid body is 400', async () => {
    const app = await testApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { ...body, password: 'short' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('invalid_body');
    await app.close();
  });

  test('wrong password is 401', async () => {
    const app = await testApp();
    await app.inject({ method: 'POST', url: '/api/auth/register', payload: body });
    const bad = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: body.email, password: 'falsch-falsch' },
    });
    expect(bad.statusCode).toBe(401);
    expect(bad.json()).toEqual({ error: 'invalid_credentials' });
    const unknown = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'niemand@example.de', password: 'irgendwas' },
    });
    expect(unknown.statusCode).toBe(401);
    const ok = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: body.email, password: body.password },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.cookies.some((c) => c.name === 'sid')).toBe(true);
    await app.close();
  });

  test('logout invalidates session', async () => {
    const app = await testApp();
    const { cookie } = await registeredAgent(app);
    const out = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } });
    expect(out.statusCode).toBe(204);
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(me.statusCode).toBe(401);
    await app.close();
  });

  test('me without cookie is 401', async () => {
    const app = await testApp();
    const me = await app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(me.statusCode).toBe(401);
    await app.close();
  });

  test('password is not stored in plain text', async () => {
    const app = await testApp();
    await app.inject({ method: 'POST', url: '/api/auth/register', payload: body });
    const db = createDb(process.env.TEST_DATABASE_URL ?? 'postgres://localhost:5432/bookly_test');
    const [row] = await db.select().from(users).where(eq(users.email, 'autor@example.de'));
    expect(row!.passwordHash).not.toContain(body.password);
    expect(row!.passwordHash.startsWith('$argon2id$')).toBe(true);
    await db.$client.end();
    await app.close();
  });

  test('expired session is 401', async () => {
    const app = await testApp();
    const { cookie } = await registeredAgent(app);
    await app.db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) });
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(me.statusCode).toBe(401);
    await app.close();
  });
});
