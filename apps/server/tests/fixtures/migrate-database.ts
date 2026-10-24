import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDatabase } from '../../src/db/client.js';
import { testDatabaseUrl } from './database.js';

/** Complete reviewed migrations before any parallel integration test can send HTTP requests. */
export default async function setup() {
  const db = createDatabase(testDatabaseUrl());
  try {
    await migrate(db.orm, {
      migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)),
    });
  } finally {
    await db.close();
  }
}
