/** Server entry point: migrates the database, listens, runs the character check worker when AI is on, and shuts down cleanly on signals. */
import { aiFromEnv } from './ai/client.js';
import { createCheckWorker } from './ai/worker.js';
import { buildApp } from './app.js';
import { createDb, runMigrations } from './db/client.js';

const ai = aiFromEnv(process.env);
const databaseUrl = process.env.DATABASE_URL ?? 'postgres://localhost:5432/bookly_dev';
const migrationDb = createDb(databaseUrl);
await runMigrations(migrationDb);
await migrationDb.$client.end();

const app = await buildApp({ databaseUrl, cookieSecure: process.env.NODE_ENV === 'production', ai });
const worker = app.ai ? createCheckWorker({ db: app.db, ai: app.ai, log: app.log }) : null;
if (worker) app.addHook('onClose', () => worker.stop());
await app.listen({ port: Number(process.env.PORT ?? 3000), host: process.env.HOST ?? 'localhost' });
worker?.start();

/** Closes the app on SIGTERM/SIGINT; the onClose hook stops the worker and awaits in-flight checks. */
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, 'shutting down');
    app.close().then(
      () => process.exit(0),
      (err: unknown) => {
        app.log.error({ err }, 'shutdown failed');
        process.exit(1);
      },
    );
  });
}
