import type { z } from 'zod';
import { AppError } from './errors.js';

/** Cursors are opaque to clients but still client-supplied; reject anything PostgreSQL could not cast. */
export function encodeCursor(parts: readonly string[]): string {
  return Buffer.from(JSON.stringify(parts)).toString('base64url');
}

export function decodeCursor<S extends z.ZodType>(cursor: string, schema: S): z.output<S> {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error('not base64url');
    return schema.parse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')));
  } catch {
    throw new AppError('VALIDATION_ERROR', '分页游标无效', 400);
  }
}
