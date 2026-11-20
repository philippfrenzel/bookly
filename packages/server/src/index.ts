/** Server entry point: migrates the database, then listens. */
import { buildApp } from './app.js';
import { createDb, runMigrations } from './db/client.js';

const databaseUrl = process.env.DATABASE_URL ?? 'postgres://localhost:5432/bookly_dev';
const migrationDb = createDb(databaseUrl);
await runMigrations(migrationDb);
await migrationDb.$client.end();

const app = await buildApp({ databaseUrl, cookieSecure: process.env.NODE_ENV === 'production' });
await app.listen({ port: Number(process.env.PORT ?? 3000), host: '0.0.0.0' });
