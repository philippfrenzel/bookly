/** Server entry point: migrates the database, then listens. */
import { aiFromEnv } from './ai/client.js';
import { buildApp } from './app.js';
import { createDb, runMigrations } from './db/client.js';

const ai = aiFromEnv(process.env);
const databaseUrl = process.env.DATABASE_URL ?? 'postgres://localhost:5432/bookly_dev';
const migrationDb = createDb(databaseUrl);
await runMigrations(migrationDb);
await migrationDb.$client.end();

const app = await buildApp({ databaseUrl, cookieSecure: process.env.NODE_ENV === 'production', ai });
await app.listen({ port: Number(process.env.PORT ?? 3000), host: process.env.HOST ?? 'localhost' });
