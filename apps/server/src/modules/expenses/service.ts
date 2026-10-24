import { eq, sql } from 'drizzle-orm';
import { allocateExpense, type SplitInput } from '@tongzhang/domain';
import type { Handler } from '../../http/context.js';
import { notReady } from '../../http/not-ready.js';
import { withTransaction, type Orm } from '../../db/transaction.js';
import { executeIdempotent } from '../../db/idempotency.js';
import { appendAudit } from '../../db/audit.js';
import { expenseSplits, expenses, ledgerMembers, ledgers, users } from '../../db/schema/index.js';
import { AppError } from '../../http/errors.js';
import { requireActive, requireLedgerMember } from '../ledgers/index.js';
import { receiptBindingNotReady, type ReceiptBinder } from './receipt.js';

export interface ExpensesService {
  createExpense: Handler<'createExpense'>;
  listExpenses: Handler<'listExpenses'>;
  getExpense: Handler<'getExpense'>;
  updateExpense: Handler<'updateExpense'>;
  deleteExpense: Handler<'deleteExpense'>;
}

export function createExpensesService(
  db: Orm,
  receipts: ReceiptBinder = receiptBindingNotReady,
): ExpensesService {
  const createExpense: Handler<'createExpense'> = async (input, context) => {
    if (!context.principal) throw new AppError('UNAUTHENTICATED', '请先登录', 401);
    if (!context.idempotencyKey)
      throw new AppError('VALIDATION_ERROR', '缺少有效的 Idempotency-Key', 400);
    const userId = context.principal.userId;
    const { ledgerId } = input.params;
    const body = input.body;

    const result = await withTransaction(db, (tx) =>
      executeIdempotent(
        tx,
        {
          userId,
          operation: `POST /api/v1/ledgers/${ledgerId.toLowerCase()}/expenses`,
          key: context.idempotencyKey!,
          request: { ledgerId: ledgerId.toLowerCase(), body },
          responseStatus: 201,
          // Membership is re-checked even before a replay.
          authorize: async () => {
            await requireLedgerMember(tx, ledgerId, userId);
          },
        },
        async () => {
          // Ledger lock: serialises with settlement start/freeze and other writers.
          const [ledger] = await tx
            .select({ id: ledgers.id })
            .from(ledgers)
            .where(eq(ledgers.id, ledgerId))
            .for('update');
          if (!ledger) throw new AppError('FORBIDDEN', '你没有权限访问此账本', 403);
          const access = await requireLedgerMember(tx, ledgerId, userId);
          requireActive(access);

          const memberRows = await tx
            .select({ id: ledgerMembers.id, username: users.username })
            .from(ledgerMembers)
            .innerJoin(users, eq(users.id, ledgerMembers.userId))
            .where(eq(ledgerMembers.ledgerId, ledgerId));
          const names = new Map(memberRows.map((m) => [m.id, m.username]));
          // Payer and each split member are validated independently against the ledger.
          if (!names.has(body.payerMemberId))
            throw new AppError('VALIDATION_ERROR', '付款人不是账本成员', 400);
          for (const s of body.splits)
            if (!names.has(s.memberId))
              throw new AppError('VALIDATION_ERROR', '分摊成员不是账本成员', 400);

          // The server recomputes the split; EQUAL/SHARES never trust client amounts.
          const total = BigInt(body.amountCents);
          const splitInput: SplitInput =
            body.splitMode === 'EQUAL'
              ? { mode: 'EQUAL', members: body.splits.map((s) => ({ memberId: s.memberId })) }
              : body.splitMode === 'SHARES'
                ? {
                    mode: 'SHARES',
                    members: body.splits.map((s) => ({ memberId: s.memberId, shares: s.shares })),
                  }
                : {
                    mode: 'AMOUNT',
                    members: body.splits.map((s) => ({
                      memberId: s.memberId,
                      amountCents: BigInt(s.amountCents),
                    })),
                  };
          let allocation;
          try {
            allocation = allocateExpense(total, splitInput);
          } catch (error) {
            throw new AppError('VALIDATION_ERROR', (error as Error).message, 400);
          }
          if (allocation.reduce((sum, a) => sum + a.amountCents, 0n) !== total)
            throw new Error('Split allocation does not conserve the expense amount');
          const sharesBy = new Map(
            body.splitMode === 'SHARES' ? body.splits.map((s) => [s.memberId, s.shares]) : [],
          );

          const [expense] = await tx
            .insert(expenses)
            .values({
              ledgerId,
              recorderMemberId: access.memberId,
              payerMemberId: body.payerMemberId,
              title: body.title,
              amountCents: total,
              category: body.category,
              occurredOn: body.occurredOn,
              splitMode: body.splitMode,
              note: body.note ?? null,
            })
            .returning();
          await tx.insert(expenseSplits).values(
            allocation.map((a) => ({
              expenseId: expense!.id,
              ledgerId,
              memberId: a.memberId,
              shares: sharesBy.get(a.memberId) ?? null,
              amountCents: a.amountCents,
            })),
          );
          if (body.receiptImageId)
            await receipts.bind(tx, {
              ledgerId,
              expenseId: expense!.id,
              imageId: body.receiptImageId,
              userId,
            });
          await tx
            .update(ledgers)
            .set({ version: sql`${ledgers.version} + 1`, updatedAt: new Date() })
            .where(eq(ledgers.id, ledgerId));
          await appendAudit(tx, {
            actorUserId: userId,
            ledgerId,
            action: 'EXPENSE_CREATED',
            targetType: 'EXPENSE',
            targetId: expense!.id,
            requestId: context.requestId,
            details: { amountCents: body.amountCents, splitMode: body.splitMode },
          });

          return {
            data: {
              id: expense!.id,
              ledgerId,
              title: expense!.title,
              amountCents: expense!.amountCents.toString(),
              category: body.category,
              occurredOn: expense!.occurredOn,
              payerMemberId: expense!.payerMemberId,
              payerName: names.get(expense!.payerMemberId)!,
              version: expense!.version,
              recorderMemberId: access.memberId,
              recorderName: names.get(access.memberId)!,
              splitMode: body.splitMode,
              splits: allocation.map((a) => ({
                memberId: a.memberId,
                username: names.get(a.memberId)!,
                shares: sharesBy.get(a.memberId) ?? null,
                amountCents: a.amountCents.toString(),
              })),
              note: expense!.note,
              receiptImageId: body.receiptImageId ?? null,
              createdAt: expense!.createdAt.toISOString(),
              updatedAt: expense!.updatedAt.toISOString(),
              canEdit: true,
            },
          };
        },
      ),
    );
    return result.body as Awaited<ReturnType<Handler<'createExpense'>>>;
  };

  return {
    createExpense,
    listExpenses: notReady('listExpenses'),
    getExpense: notReady('getExpense'),
    updateExpense: notReady('updateExpense'),
    deleteExpense: notReady('deleteExpense'),
  };
}
