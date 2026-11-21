/** Fastify application factory. */
import cookie from '@fastify/cookie';
import Fastify, { type FastifyInstance } from 'fastify';
import { additionRoutes } from './books/additions.js';
import { aiRoutes } from './books/aiRoutes.js';
import { decorateMutate } from './books/mutateWithChecks.js';
import { authRoutes } from './auth/routes.js';
import { bookRoutes } from './books/routes.js';
import { characterRoutes } from './books/characters.js';
import { acknowledgementRoutes } from './books/acknowledgements.js';
import { connectionRoutes } from './books/connections.js';
import { sceneBlockRoutes } from './books/sceneBlocks.js';
import { sceneRoutes } from './books/scenes.js';
import { collabRoutes } from './manuscript/collab.js';
import { styleRoutes } from './manuscript/styles.js';
import { proposalRoutes } from './manuscript/proposals.js';
import { manuscriptAiTextRoutes } from './manuscript/aiText.js';
import { reviewerRoutes } from './manuscript/reviewers.js';
import { manuscriptRoutes } from './manuscript/routes.js';
import { sectionRoutes } from './books/sections.js';
import { storylineRoutes } from './books/storylines.js';
import { timePointRoutes } from './books/timepoints.js';
import type { AiClient } from './ai/client.js';
import { createDb } from './db/client.js';
import { NotFoundError, ValidationError } from './errors.js';

/** Runtime configuration for the server. */
export interface AppConfig {
  databaseUrl: string;
  cookieSecure: boolean;
  /** Enables the Fastify logger (default true; tests pass false). */
  logger?: boolean;
  /** AI client; null or absent disables AI features. */
  ai?: AiClient | null;
}

/** Builds the Fastify app (does not listen and does not run migrations). */
export async function buildApp(config: AppConfig): Promise<FastifyInstance> {
  const app = Fastify({ logger: config.logger ?? true });
  const db = createDb(config.databaseUrl);
  app.decorate('db', db);
  app.decorate('config', config);
  app.decorate('ai', config.ai ?? null);
  decorateMutate(app);
  app.addHook('onClose', async () => {
    await db.$client.end();
  });
  app.setErrorHandler((error: Error & { statusCode?: number }, request, reply) => {
    if (error instanceof ValidationError) return reply.code(422).send({ issues: error.issues });
    if (error instanceof NotFoundError) return reply.code(404).send({ error: 'not_found' });
    const status = error.statusCode ?? 500;
    if (status >= 500) request.log.error(error);
    return reply.code(status).send({ error: status >= 500 ? 'internal_error' : error.message });
  });
  await app.register(cookie);
  await app.register(authRoutes);
  await app.register(bookRoutes);
  await app.register(timePointRoutes);
  await app.register(characterRoutes);
  await app.register(storylineRoutes);
  await app.register(additionRoutes);
  await app.register(sectionRoutes);
  await app.register(connectionRoutes);
  await app.register(acknowledgementRoutes);
  await app.register(aiRoutes);
  await app.register(sceneRoutes);
  await app.register(sceneBlockRoutes);
  await app.register(manuscriptRoutes);
  await app.register(reviewerRoutes);
  await app.register(proposalRoutes);
  await app.register(manuscriptAiTextRoutes);
  await app.register(collabRoutes);
  await app.register(styleRoutes);
  return app;
}
