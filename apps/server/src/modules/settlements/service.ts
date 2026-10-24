import type { Handler } from '../../http/context.js';
import { notReady } from '../../http/not-ready.js';
import type { Orm } from '../../db/transaction.js';
import { AppError } from '../../http/errors.js';
import { computeBalances, readLedgerSnapshot, toBalanceDto } from '../balances/index.js';

import { requireActive } from '../ledgers/index.js';
import { SETTLEMENT_ALGORITHM, solveSettlement } from './solver.js';

export interface SettlementsService {
  previewSettlement: Handler<'previewSettlement'>;
  startSettlement: Handler<'startSettlement'>;
  getSettlement: Handler<'getSettlement'>;
  markTransferPaid: Handler<'markTransferPaid'>;
  settleLedger: Handler<'settleLedger'>;
}

export function createSettlementsService(db: Orm): SettlementsService {
  return {
    /**
     * Read-only preview. It never writes batches/transfers, never bumps the version and never freezes.
     * T19 (startSettlement) must, in ONE transaction: lock the ledger row (SELECT ... FOR UPDATE),
     * compare expectedVersion with ledgers.version (409 on mismatch), recompute balances with this same
     * calculator + solver, insert the batch/transfers, then set status SETTLING (freeze) and bump version.
     * The preview result is advisory and must never be trusted by that write path.
     */
    previewSettlement: async (input, context) => {
      if (!context.principal) throw new AppError('UNAUTHENTICATED', '请先登录', 401);
      const snapshot = await readLedgerSnapshot(
        db,
        input.params.ledgerId,
        context.principal.userId,
      );
      requireActive(snapshot.access);
      const members = computeBalances(snapshot.members);
      const transfers = solveSettlement(
        members.map((m) => ({ memberId: m.memberId, netCents: m.netCents })),
      );
      const transferTotal = transfers.reduce((s, t) => s + t.amountCents, 0n);
      return {
        data: {
          ledgerId: input.params.ledgerId,
          ledgerVersion: snapshot.version,
          expenseTotalCents: members.reduce((s, m) => s + m.paidCents, 0n).toString(),
          transferTotalCents: transferTotal.toString(),
          transferCount: transfers.length,
          members: members.map(toBalanceDto),
          transfers: transfers.map((t, i) => ({
            sequence: i + 1,
            payerMemberId: t.payerMemberId,
            payeeMemberId: t.payeeMemberId,
            amountCents: t.amountCents.toString(),
          })),
          algorithmVersion: SETTLEMENT_ALGORITHM,
        },
      } as Awaited<ReturnType<Handler<'previewSettlement'>>>;
    },
    startSettlement: notReady('startSettlement'),
    getSettlement: notReady('getSettlement'),
    markTransferPaid: notReady('markTransferPaid'),
    settleLedger: notReady('settleLedger'),
  };
}
