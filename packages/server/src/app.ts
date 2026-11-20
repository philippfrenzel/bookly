/** Fastify application factory. */
import cookie from '@fastify/cookie';
import Fastify, { type FastifyInstance } from 'fastify';
import { authRoutes } from './auth/routes.js';
import { bookRoutes } from './books/routes.js';
import { createDb } from './db/client.js';
import { NotFoundError, ValidationError } from './errors.js';

/** Runtime configuration for the server. */
export interface AppConfig {
  databaseUrl: string;
  cookieSecure: boolean;
}

/** Builds the Fastify app (does not listen and does not run migrations). */
export async function buildApp(config: AppConfig): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const db = createDb(config.databaseUrl);
  app.decorate('db', db);
  app.decorate('config', config);
  app.addHook('onClose', async () => {
    await db.$client.end();
  });
  app.setErrorHandler((error: Error & { statusCode?: number }, _request, reply) => {
    if (error instanceof ValidationError) return reply.code(422).send({ issues: error.issues });
    if (error instanceof NotFoundError) return reply.code(404).send({ error: 'not_found' });
    const status = error.statusCode ?? 500;
    return reply.code(status).send({ error: status >= 500 ? 'internal_error' : error.message });
  });
  await app.register(cookie);
  await app.register(authRoutes);
  await app.register(bookRoutes);
  return app;
}
