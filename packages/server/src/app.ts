/** Fastify application factory. */
import cookie from '@fastify/cookie';
import Fastify, { type FastifyInstance } from 'fastify';
import { authRoutes } from './auth/routes.js';
import { createDb } from './db/client.js';

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
  await app.register(cookie);
  await app.register(authRoutes);
  return app;
}
