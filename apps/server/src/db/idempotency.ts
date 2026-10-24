import { createHash } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { uuidSchema } from '@tongzhang/contracts';
import type { Transaction } from './transaction.js';
import { idempotencyKeys } from './schema/index.js';
import { AppError } from '../http/errors.js';

/** JSON object key order is irrelevant; array order and scalar types remain significant. */
function canonicalJson(value: unknown, ancestors = new Set<object>()): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (typeof value !== 'object' || !value || ancestors.has(value))
    throw new AppError('VALIDATION_ERROR', '幂等请求必须使用有效 JSON 数据', 400);
  ancestors.add(value);
  try {
    if (Array.isArray(value))
      return `[${Array.from(value, (item) => canonicalJson(item, ancestors)).join(',')}]`;
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
      throw new AppError('VALIDATION_ERROR', '幂等请求必须使用有效 JSON 数据', 400);
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .filter((key) => object[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key], ancestors)}`)
      .join(',')}}`;
  } finally {
    ancestors.delete(value);
  }
}
export const hashIdempotencyRequest = (request: unknown) =>
  createHash('sha256').update(canonicalJson(request)).digest('hex');

export interface IdempotencyScope {
  userId: string;
  /** Method + normalized resource path; include resource IDs and omit query ordering. */
  operation: string;
  key: string;
  request: unknown;
  responseStatus: number;
  /** Service-owned access check, repeated after waiting for a competing request. */
  authorize: () => Promise<void>;
}

/** The service owns tx and supplies access checks; replay never bypasses authorization. */
export async function executeIdempotent<T>(
  tx: Transaction,
  scope: IdempotencyScope,
  work: () => Promise<T>,
): Promise<{ body: T; statusCode: number; replayed: boolean }> {
  if (!uuidSchema.safeParse(scope.key).success || !scope.operation || scope.operation.length > 160)
    throw new AppError('VALIDATION_ERROR', '缺少有效的幂等请求标识', 400);
  if (
    !Number.isInteger(scope.responseStatus) ||
    scope.responseStatus < 200 ||
    scope.responseStatus > 299
  )
    throw new Error('Idempotency only stores successful responses');
  const hash = hashIdempotencyRequest(scope.request);
  await lockIdempotencyKey(tx, scope.userId, scope.operation, scope.key);
  await scope.authorize();
  const match = and(
    eq(idempotencyKeys.userId, scope.userId),
    eq(idempotencyKeys.operation, scope.operation),
    eq(idempotencyKeys.key, scope.key),
  );
  const [existing] = await tx.select().from(idempotencyKeys).where(match).limit(1);
  const now = new Date();
  if (existing && existing.expiresAt > now) {
    if (existing.requestHash !== hash)
      throw new AppError('IDEMPOTENCY_CONFLICT', '该请求标识已用于其他内容，请核对原提交', 409);
    return {
      body: existing.responseBody as T,
      statusCode: existing.responseStatus,
      replayed: true,
    };
  }
  if (existing) await tx.delete(idempotencyKeys).where(match);
  const body = await work();
  // Validate before persistence. A serialization failure must roll back the business work too.
  let jsonBody: unknown;
  try {
    jsonBody = JSON.parse(canonicalJson(body));
  } catch {
    throw new Error('Idempotency responses must contain only JSON-safe values');
  }
  await tx.insert(idempotencyKeys).values({
    userId: scope.userId,
    operation: scope.operation,
    key: scope.key,
    requestHash: hash,
    responseStatus: scope.responseStatus,
    responseBody: jsonBody,
    createdAt: now,
    expiresAt: new Date(now.getTime() + 7 * 86400000),
  });
  return { body, statusCode: scope.responseStatus, replayed: false };
}
/** Acquire before the ledger lock; lookup and result insert stay in the same tx. */
export const lockIdempotencyKey = (
  tx: Transaction,
  userId: string,
  operation: string,
  key: string,
) =>
  tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify([userId, operation, key])}, 0))`,
  );
