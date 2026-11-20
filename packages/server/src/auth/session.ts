/** Session creation, lookup and the requireUser preHandler. */
import { randomBytes } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Id, SessionUser } from '@bookly/shared';
import type { Db } from '../db/client.js';
import { sessions, users } from '../db/schema.js';

/** Session lifetime: 30 days. */
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

declare module 'fastify' {
  interface FastifyRequest {
    user?: SessionUser;
  }
  interface FastifyInstance {
    db: Db;
    config: { databaseUrl: string; cookieSecure: boolean; logger?: boolean };
  }
}

/** Creates a session row for the user and returns its id. */
export async function createSession(db: Db, userId: Id): Promise<string> {
  const sid = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
  await db.insert(sessions).values({ id: sid, userId, expiresAt });
  return sid;
}

/** Looks up the user for a session id; expired or unknown sessions yield null. */
export async function findSessionUser(db: Db, sid: string): Promise<SessionUser | null> {
  const [row] = await db
    .select({ id: users.id, email: users.email, displayName: users.displayName })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, sid), gt(sessions.expiresAt, new Date())));
  return row ?? null;
}

/** Deletes a session. */
export async function deleteSession(db: Db, sid: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sid));
}

/** Fastify preHandler: sets request.user from the sid cookie or replies 401. */
export async function requireUser(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const sid = request.cookies.sid;
  const user = sid ? await findSessionUser(request.server.db, sid) : null;
  if (!user) {
    await reply.code(401).send({ error: 'unauthorized' });
    return;
  }
  request.user = user;
}
