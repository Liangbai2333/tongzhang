import type { Handler } from '../../http/context.js';
import { notReady } from '../../http/not-ready.js';
import type { Orm } from '../../db/transaction.js';
import { AppError } from '../../http/errors.js';
import { computeBalances, toBalanceDto } from './calculator.js';
import { readLedgerSnapshot } from './snapshot.js';

export interface BalancesService {
  getBalances: Handler<'getBalances'>;
  getStatistics: Handler<'getStatistics'>;
}

export function createBalancesService(db: Orm): BalancesService {
  return {
    getBalances: async (input, context) => {
      if (!context.principal) throw new AppError('UNAUTHENTICATED', '请先登录', 401);
      const snapshot = await readLedgerSnapshot(
        db,
        input.params.ledgerId,
        context.principal.userId,
      );
      const members = computeBalances(snapshot.members);
      return {
        data: {
          expenseTotalCents: members.reduce((s, m) => s + m.paidCents, 0n).toString(),
          members: members.map(toBalanceDto),
        },
      } as Awaited<ReturnType<Handler<'getBalances'>>>;
    },
    getStatistics: notReady('getStatistics'),
  };
}
