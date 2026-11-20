/** Test helpers: app with a freshly truncated test database, and a registered agent. */
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Id } from '@bookly/shared';
import { buildApp } from '../app.js';
import { createDb, runMigrations } from '../db/client.js';

const TEST_URL = process.env.TEST_DATABASE_URL ?? 'postgres://localhost:5432/bookly_test';
let migrated = false;
let counter = 0;

/** Builds an app against bookly_test; migrates once per process and truncates all tables. */
export async function testApp(): Promise<FastifyInstance> {
  const db = createDb(TEST_URL);
  try {
    if (!migrated) {
      await runMigrations(db);
      migrated = true;
    }
    const tables = await db.execute<{ tablename: string }>(
      sql`select tablename from pg_tables where schemaname = 'public' and tablename <> '__drizzle_migrations'`,
    );
    if (tables.length > 0) {
      const names = tables.map((t) => `"${t.tablename}"`).join(', ');
      await db.execute(sql.raw(`TRUNCATE ${names} RESTART IDENTITY CASCADE`));
    }
  } finally {
    await db.$client.end();
  }
  return buildApp({ databaseUrl: TEST_URL, cookieSecure: false, logger: false });
}

/** Registers a user and returns the session cookie header value plus the user id. */
export async function registeredAgent(
  app: FastifyInstance,
  email = `autor${++counter}@example.de`,
): Promise<{ cookie: string; userId: Id }> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email, password: 'geheimes-passwort', displayName: 'Autor' },
  });
  if (res.statusCode !== 201) throw new Error(`register failed: ${res.body}`);
  const sid = res.cookies.find((c) => c.name === 'sid')!.value;
  return { cookie: `sid=${sid}`, userId: res.json().user.id };
}
