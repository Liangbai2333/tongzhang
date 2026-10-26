import { eq } from 'drizzle-orm';
import { endpoints } from '@tongzhang/contracts';
import type { Handler } from '../../http/context.js';
import { AppError } from '../../http/errors.js';
import { withTransaction, type Orm, type Transaction } from '../../db/transaction.js';
import { executeIdempotent } from '../../db/idempotency.js';
import { appendAudit } from '../../db/audit.js';
import { ledgers, settlementTransfers } from '../../db/schema/index.js';
import { computeBalances, readLedgerSnapshotInTransaction } from '../balances/index.js';
import {
  requireCreator,
  requireLedgerMember,
  requireTransferRegistrar,
  type LedgerAccess,
} from '../ledgers/index.js';
import { readSettlement, readTransfer } from './repository.js';
import { toProgressDto, toSettlementDto, toTransferDto } from './mapper.js';

async function lockLedger(tx: Transaction, ledgerId: string) {
  const [ledger] = await tx.select().from(ledgers).where(eq(ledgers.id, ledgerId)).for('update');
  if (!ledger) throw new AppError('FORBIDDEN', '你没有权限访问此账本', 403);
  return ledger;
}

/** Replays check role even after SETTLED; state validation applies only to a new registration. */
function requireRegistrarRole(access: LedgerAccess, payerMemberId: string) {
  if (!access.isCreator && access.memberId !== payerMemberId)
    throw new AppError('FORBIDDEN', '只有付款人或创建者可登记已还', 403);
}

export function createGetSettlement(db: Orm): Handler<'getSettlement'> {
  return async (input, context) => {
    if (!context.principal) throw new AppError('UNAUTHENTICATED', '请先登录', 401);
    const userId = context.principal.userId;
    return db.transaction(
      async (tx) => {
        const access = await requireLedgerMember(tx, input.params.ledgerId, userId);
        const { batch, transfers } = await readSettlement(tx, input.params.ledgerId);
        return { data: toSettlementDto(batch, transfers, access.status) };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  };
}

export function createMarkTransferPaid(db: Orm): Handler<'markTransferPaid'> {
  return async (input, context) => {
    if (!context.principal) throw new AppError('UNAUTHENTICATED', '请先登录', 401);
    if (!context.idempotencyKey)
      throw new AppError('VALIDATION_ERROR', '缺少有效的 Idempotency-Key', 400);
    const userId = context.principal.userId;
    const ledgerId = input.params.ledgerId.toLowerCase();
    const transferId = input.params.transferId.toLowerCase();
    const result = await withTransaction(db, (tx) =>
      executeIdempotent(
        tx,
        {
          userId,
          operation: `POST /api/v1/ledgers/${ledgerId}/settlement/transfers/${transferId}/paid`,
          key: context.idempotencyKey!,
          request: { ledgerId, transferId, body: input.body },
          responseStatus: 200,
          authorize: async () => {
            const access = await requireLedgerMember(tx, ledgerId, userId);
            requireRegistrarRole(
              access,
              (await readTransfer(tx, ledgerId, transferId)).payerMemberId,
            );
          },
        },
        async () => {
          await lockLedger(tx, ledgerId);
          const access = await requireLedgerMember(tx, ledgerId, userId);
          let transfer = await readTransfer(tx, ledgerId, transferId);
          requireRegistrarRole(access, transfer.payerMemberId);
          if (transfer.status !== 'PAID') {
            requireTransferRegistrar(access, transfer.payerMemberId);
            const now = new Date();
            const [updated] = await tx
              .update(settlementTransfers)
              .set({
                status: 'PAID',
                registeredByMemberId: access.memberId,
                registeredAt: now,
                registrationNote: input.body.note ?? null,
              })
              .where(eq(settlementTransfers.id, transferId))
              .returning();
            transfer = updated!;
            await tx.update(ledgers).set({ updatedAt: now }).where(eq(ledgers.id, ledgerId));
            await appendAudit(tx, {
              actorUserId: userId,
              ledgerId,
              action: 'TRANSFER_PAID',
              targetType: 'SETTLEMENT_TRANSFER',
              targetId: transferId,
              requestId: context.requestId,
            });
          }
          const { transfers } = await readSettlement(tx, ledgerId);
          return endpoints.markTransferPaid.response.parse({
            data: { transfer: toTransferDto(transfer), progress: toProgressDto(transfers) },
          });
        },
      ),
    );
    return result.body;
  };
}

export function createSettleLedger(db: Orm): Handler<'settleLedger'> {
  return async (input, context) => {
    if (!context.principal) throw new AppError('UNAUTHENTICATED', '请先登录', 401);
    if (!context.idempotencyKey)
      throw new AppError('VALIDATION_ERROR', '缺少有效的 Idempotency-Key', 400);
    const userId = context.principal.userId;
    const ledgerId = input.params.ledgerId.toLowerCase();
    const result = await withTransaction(db, (tx) =>
      executeIdempotent(
        tx,
        {
          userId,
          operation: `POST /api/v1/ledgers/${ledgerId}/settle`,
          key: context.idempotencyKey!,
          request: { ledgerId },
          responseStatus: 200,
          authorize: async () => requireCreator(await requireLedgerMember(tx, ledgerId, userId)),
        },
        async () => {
          const ledger = await lockLedger(tx, ledgerId);
          const access = await requireLedgerMember(tx, ledgerId, userId);
          requireCreator(access);
          if (access.status === 'ACTIVE')
            throw new AppError('LEDGER_STATE_INVALID', '请先发起正式结算', 409);
          const { batch, transfers } = await readSettlement(tx, ledgerId);
          const snapshot = await readLedgerSnapshotInTransaction(tx, ledgerId, userId);
          if (
            transfers.length !== batch.transferCount ||
            transfers.some((t) => t.status !== 'PAID') ||
            computeBalances(snapshot.members).some((m) => m.remainingNetCents !== 0n)
          )
            throw new AppError('SETTLEMENT_INCOMPLETE', '请先登记全部转账并核对剩余余额', 409);
          const settledAt = ledger.settledAt ?? new Date();
          if (access.status !== 'SETTLED') {
            await tx
              .update(ledgers)
              .set({
                status: 'SETTLED',
                settledAt,
                updatedAt: settledAt,
                version: ledger.version + 1,
              })
              .where(eq(ledgers.id, ledgerId));
            await appendAudit(tx, {
              actorUserId: userId,
              ledgerId,
              action: 'LEDGER_SETTLED',
              targetType: 'LEDGER',
              targetId: ledgerId,
              requestId: context.requestId,
            });
          }
          return endpoints.settleLedger.response.parse({
            data: { ledgerId, status: 'SETTLED', settledAt: settledAt.toISOString() },
          });
        },
      ),
    );
    return result.body;
  };
}
