import { defineConfig } from 'drizzle-kit';
import { databaseConfig, loadLocalEnv, readEnv } from './src/config/env.ts';

loadLocalEnv();
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/*.ts',
  out: './drizzle',
  dbCredentials: databaseConfig(readEnv()),
  strict: true,
  verbose: true,
});
