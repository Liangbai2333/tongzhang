import { z } from 'zod';
import { fileURLToPath } from 'node:url';

const httpUrlOrEmptySchema = z
  .string()
  .trim()
  .default('')
  .refine((value) => {
    if (value === '') return true;
    try {
      const parsed = new URL(value);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3300),
  PGHOST: z.string().min(1),
  PGPORT: z.coerce.number().int().min(1).max(65535),
  PGUSER: z.string().min(1),
  PGPASSWORD: z.string().min(1),
  AUTH_JWT_SECRET: z.string().regex(/^[0-9a-f]{64}$/),
  PGDATABASE: z.string().min(1),
  TRUST_PROXY: z.union([z.ipv4(), z.ipv6(), z.cidrv4(), z.cidrv6(), z.literal('')]).default(''),
  LOG_LEVEL: z.enum(['silent', 'fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  AI_DRAFT_API_BASE_URL: httpUrlOrEmptySchema,
  AI_DRAFT_API_KEY: z.string().trim().default(''),
  AI_DRAFT_MODEL: z.string().trim().default(''),
  AI_DRAFT_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(15000),
});

export type Env = z.infer<typeof envSchema>;
export interface AiDraftProviderConfig {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
}
export function readEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    // Configuration errors must not print credentials or the original input.
    throw new Error(
      `环境变量无效或缺失：${result.error.issues.map((issue) => issue.path.join('.')).join(', ')}`,
    );
  }
  return result.data;
}

export function databaseConfig(env: Env) {
  return {
    host: env.PGHOST,
    port: env.PGPORT,
    user: env.PGUSER,
    password: env.PGPASSWORD,
    database: env.PGDATABASE,
  };
}

export function aiDraftConfig(env: Env): AiDraftProviderConfig | null {
  if (!env.AI_DRAFT_API_BASE_URL || !env.AI_DRAFT_API_KEY || !env.AI_DRAFT_MODEL) return null;
  return {
    apiBaseUrl: env.AI_DRAFT_API_BASE_URL,
    apiKey: env.AI_DRAFT_API_KEY,
    model: env.AI_DRAFT_MODEL,
    timeoutMs: env.AI_DRAFT_TIMEOUT_MS,
  };
}

export function loadLocalEnv(path = fileURLToPath(new URL('../../.env', import.meta.url))): void {
  if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'test' || process.env.CI)
    return;
  try {
    process.loadEnvFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}
