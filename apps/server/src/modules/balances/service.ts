import type { Handler } from '../../http/context.js';
import { notReady } from '../../http/not-ready.js';
export interface BalancesService {
  getBalances: Handler<'getBalances'>;
  getStatistics: Handler<'getStatistics'>;
}
export function createBalancesService(): BalancesService {
  return {
    getBalances: notReady('getBalances'),
    getStatistics: notReady('getStatistics'),
  };
}
