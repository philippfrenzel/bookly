/** Auth routes: register, login, logout, me. */
import { hash, verify } from '@node-rs/argon2';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { LoginBody, RegisterBody } from '@bookly/shared';
import { users } from '../db/schema.js';
import { SESSION_MAX_AGE_SECONDS, createSession, deleteSession, requireUser } from './session.js';

/** Registers the /api/auth/* routes on the app. */
export async function authRoutes(app: FastifyInstance): Promise<void> {
  const setSessionCookie = (reply: FastifyReply, sid: string) =>
    reply.setCookie('sid', sid, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: app.config.cookieSecure,
      maxAge: SESSION_MAX_AGE_SECONDS,
    });

  app.post('/api/auth/register', async (request, reply) => {
    const parsed = RegisterBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    const { email, password, displayName } = parsed.data;
    const passwordHash = await hash(password);
    const [created] = await app.db
      .insert(users)
      .values({ email, passwordHash, displayName })
      .onConflictDoNothing({ target: users.email })
      .returning({ id: users.id });
    if (!created) return reply.code(409).send({ error: 'email_taken' });
    setSessionCookie(reply, await createSession(app.db, created.id));
    return reply.code(201).send({ user: { id: created.id, email, displayName } });
  });

  app.post('/api/auth/login', async (request, reply) => {
    const parsed = LoginBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    const [row] = await app.db.select().from(users).where(eq(users.email, parsed.data.email));
    if (!row || !(await verify(row.passwordHash, parsed.data.password))) {
      return reply.code(401).send({ error: 'invalid_credentials' });
    }
    setSessionCookie(reply, await createSession(app.db, row.id));
    return reply.send({ user: { id: row.id, email: row.email, displayName: row.displayName } });
  });

  app.post('/api/auth/logout', async (request, reply) => {
    const sid = request.cookies.sid;
    if (sid) await deleteSession(app.db, sid);
    reply.clearCookie('sid', { path: '/' });
    return reply.code(204).send();
  });

  app.get('/api/auth/me', { preHandler: requireUser }, async (request) => ({ user: request.user }));
}
