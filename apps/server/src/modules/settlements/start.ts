import { eq } from 'drizzle-orm';
import { endpoints } from '@tongzhang/contracts';
import type { Handler } from '../../http/context.js';
import { AppError } from '../../http/errors.js';
import { withTransaction, type Orm } from '../../db/transaction.js';
import { executeIdempotent } from '../../db/idempotency.js';
import { appendAudit } from '../../db/audit.js';
import { ledgers, settlementBatches, settlementTransfers } from '../../db/schema/index.js';
import { computeBalances, readLedgerSnapshotInTransaction } from '../balances/index.js';
import { requireActive, requireCreator, requireLedgerMember } from '../ledgers/index.js';
import { SETTLEMENT_ALGORITHM, solveSettlement } from './solver.js';

export function createStartSettlement(db: Orm): Handler<'startSettlement'> {
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
          operation: `POST /api/v1/ledgers/${ledgerId}/settlement`,
          key: context.idempotencyKey!,
          request: { ledgerId, body: input.body },
          responseStatus: 201,
          authorize: async () => {
            // Replays remain available after freezing, but never bypass creator permission.
            requireCreator(await requireLedgerMember(tx, ledgerId, userId));
          },
        },
        async () => {
          // Same order as createExpense: idempotency lock, ledger lock, then fresh access/state.
          const [ledger] = await tx
            .select({ version: ledgers.version })
            .from(ledgers)
            .where(eq(ledgers.id, ledgerId))
            .for('update');
          if (!ledger) throw new AppError('FORBIDDEN', '你没有权限访问此账本', 403);
          const access = await requireLedgerMember(tx, ledgerId, userId);
          requireCreator(access);
          requireActive(access);
          if (ledger.version !== input.body.expectedVersion)
            throw new AppError('VERSION_CONFLICT', '账本已更新，请重新预览结算', 409);

          // Reuse the real balance reader on this exact tx, after acquiring the write lock.
          // Never open a second read-only transaction or trust a submitted preview plan.
          const snapshot = await readLedgerSnapshotInTransaction(tx, ledgerId, userId);
          const members = computeBalances(snapshot.members);
          const netSnapshot = members.map(({ memberId, netCents }) => ({
            memberId,
            netCents: netCents.toString(),
          }));
          const plan = solveSettlement(members);
          const expenseTotalCents = members.reduce((sum, m) => sum + m.paidCents, 0n);
          const transferTotalCents = plan.reduce((sum, t) => sum + t.amountCents, 0n);
          const [batch] = await tx
            .insert(settlementBatches)
            .values({
              ledgerId,
              createdByMemberId: access.memberId,
              sourceVersion: ledger.version,
              expenseTotalCents,
              transferTotalCents,
              transferCount: plan.length,
              netSnapshot,
              algorithmVersion: SETTLEMENT_ALGORITHM,
            })
            .returning();
          const transfers = plan.length
            ? await tx
                .insert(settlementTransfers)
                .values(
                  plan.map((t, i) => ({
                    ...t,
                    ledgerId,
                    batchId: batch!.id,
                    sequence: i + 1,
                  })),
                )
                .returning()
            : [];
          const now = new Date();
          const ledgerStatus = plan.length ? 'SETTLING' : 'SETTLED';
          await tx
            .update(ledgers)
            .set({
              status: ledgerStatus,
              version: ledger.version + 1,
              updatedAt: now,
              settledAt: plan.length ? null : now,
            })
            .where(eq(ledgers.id, ledgerId));
          await appendAudit(tx, {
            actorUserId: userId,
            ledgerId,
            action: 'SETTLEMENT_STARTED',
            targetType: 'SETTLEMENT_BATCH',
            targetId: batch!.id,
            requestId: context.requestId,
            details: { sourceVersion: ledger.version, transferCount: plan.length, ledgerStatus },
          });
          // Validate before commit so an invalid DTO cannot leave a frozen ledger behind.
          return endpoints.startSettlement.response.parse({
            data: {
              ledgerStatus,
              batch: {
                id: batch!.id,
                ledgerId,
                sourceVersion: ledger.version,
                expenseTotalCents: expenseTotalCents.toString(),
                transferTotalCents: transferTotalCents.toString(),
                transferCount: plan.length,
                algorithmVersion: SETTLEMENT_ALGORITHM,
                createdAt: batch!.createdAt.toISOString(),
                ledgerStatus,
                transfers: transfers
                  .sort((a, b) => a.sequence - b.sequence)
                  .map((t) => ({
                    ...t,
                    amountCents: t.amountCents.toString(),
                    registeredAt: null,
                  })),
                progress: {
                  paidCount: 0,
                  totalCount: plan.length,
                  remainingCents: transferTotalCents.toString(),
                },
              },
            },
          });
        },
      ),
    );
    return result.body;
  };
}
