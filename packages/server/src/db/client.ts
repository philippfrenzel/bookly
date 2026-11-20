/** Database connection factory and migration runner. */
import { fileURLToPath } from 'node:url';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import * as schema from './schema.js';

/** Typed Drizzle database handle. */
export type Db = ReturnType<typeof createDb>;

/** Creates a Drizzle client for the given connection URL. */
export function createDb(url: string): PostgresJsDatabase<typeof schema> & { $client: postgres.Sql } {
  return drizzle(postgres(url, { onnotice: () => {} }), { schema });
}

/** Applies all pending SQL migrations from packages/server/drizzle. */
export async function runMigrations(db: Db): Promise<void> {
  await migrate(db, { migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)) });
}
