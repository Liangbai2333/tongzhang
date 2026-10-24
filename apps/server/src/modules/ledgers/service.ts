import type { Handler } from '../../http/context.js';
import { notReady } from '../../http/not-ready.js';
import type { Orm } from '../../db/transaction.js';
import { AppError } from '../../http/errors.js';
import { requireLedgerMember } from './access.js';
export interface LedgersService {
  createLedger: Handler<'createLedger'>;
  listLedgers: Handler<'listLedgers'>;
  getLedger: Handler<'getLedger'>;
  listMembers: Handler<'listMembers'>;
  archiveLedger: Handler<'archiveLedger'>;
}
export function createLedgersService(db: Orm): LedgersService {
  function guarded<K extends 'getLedger' | 'listMembers' | 'archiveLedger'>(
    operation: K,
  ): Handler<K> {
    return async (input, context) => {
      if (!context.principal) throw new AppError('UNAUTHENTICATED', '请先登录', 401);
      await requireLedgerMember(db, input.params.ledgerId, context.principal.userId);
      return notReady(operation)(input, context);
    };
  }
  return {
    createLedger: notReady('createLedger'),
    listLedgers: notReady('listLedgers'),
    getLedger: guarded('getLedger'),
    listMembers: guarded('listMembers'),
    archiveLedger: guarded('archiveLedger'),
  };
}
