import { defineConfig } from 'drizzle-kit';
import { loadLocalEnv, readEnv } from './src/config/env.ts';

loadLocalEnv();
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/*.ts',
  out: './drizzle',
  dbCredentials: { url: readEnv().DATABASE_URL },
  strict: true,
  verbose: true,
});
