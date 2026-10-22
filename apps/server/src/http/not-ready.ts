import type { Operation } from '@tongzhang/contracts';
import type { Handler } from './context.js';
import { AppError } from './errors.js';
/** A scaffolding endpoint must never acknowledge a write that was not performed. */
export function notReady<K extends Operation>(operation: K): Handler<K> {
  return async () => {
    throw new AppError('FEATURE_NOT_READY', `${operation} 业务服务尚未接通`, 501);
  };
}
