import { and, eq, isNull, sql } from 'drizzle-orm';
import { expenseDetailSchema } from '@tongzhang/contracts';
import { allocateExpense, type SplitInput } from '@tongzhang/domain';
import type { Handler } from '../../http/context.js';
import { notReady } from '../../http/not-ready.js';
import { withTransaction, type Orm } from '../../db/transaction.js';
import { executeIdempotent } from '../../db/idempotency.js';
import { appendAudit } from '../../db/audit.js';
import {
  expenseImages,
  expenseSplits,
  expenses,
  ledgerMembers,
  ledgers,
  users,
} from '../../db/schema/index.js';
import { AppError } from '../../http/errors.js';
import { requireActive, requireLedgerMember } from '../ledgers/index.js';
import type { ReceiptBinder } from './receipt.js';
import { receiptBinder } from '../images/index.js';
import { queryExpenses } from './queries.js';

export interface ExpensesService {
  createExpense: Handler<'createExpense'>;
  listExpenses: Handler<'listExpenses'>;
  getExpense: Handler<'getExpense'>;
  updateExpense: Handler<'updateExpense'>;
  deleteExpense: Handler<'deleteExpense'>;
}

export function createExpensesService(
  db: Orm,
  receipts: ReceiptBinder = receiptBinder,
): ExpensesService {
  const createExpense: Handler<'createExpense'> = async (input, context) => {
    const userId = context.principal.userId;
    const { ledgerId } = input.params;
    const body = input.body;

    const result = await withTransaction(db, (tx) =>
      executeIdempotent(
        tx,
        {
          userId,
          operation: `POST /api/v1/ledgers/${ledgerId}/expenses`,
          key: context.idempotencyKey,
          request: { ledgerId, body },
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

  const listExpenses: Handler<'listExpenses'> = async (input, context) => {
    const userId = context.principal.userId;
    return db.transaction(
      async (tx) => {
        await requireLedgerMember(tx, input.params.ledgerId, userId);
        return queryExpenses(tx, input.params.ledgerId, input.query);
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  };

  const getExpense: Handler<'getExpense'> = async (input, context) => {
    const userId = context.principal.userId;
    const { ledgerId, expenseId } = input.params;
    return db.transaction(
      async (tx) => {
        const access = await requireLedgerMember(tx, ledgerId, userId);
        const [expense] = await tx
          .select()
          .from(expenses)
          .where(
            and(
              eq(expenses.ledgerId, ledgerId),
              eq(expenses.id, expenseId),
              isNull(expenses.deletedAt),
            ),
          );
        if (!expense) throw new AppError('NOT_FOUND', '消费记录不存在', 404);
        const members = await tx
          .select({ id: ledgerMembers.id, username: users.username })
          .from(ledgerMembers)
          .innerJoin(users, eq(users.id, ledgerMembers.userId))
          .where(eq(ledgerMembers.ledgerId, ledgerId));
        const names = new Map(members.map((m) => [m.id, m.username]));
        const splits = await tx
          .select()
          .from(expenseSplits)
          .where(eq(expenseSplits.expenseId, expense.id))
          .orderBy(expenseSplits.memberId);
        const [receipt] = await tx
          .select({ imageId: expenseImages.imageId })
          .from(expenseImages)
          .where(eq(expenseImages.expenseId, expense.id));
        return {
          data: expenseDetailSchema.parse({
            ...expense,
            amountCents: expense.amountCents.toString(),
            payerName: names.get(expense.payerMemberId),
            recorderName: names.get(expense.recorderMemberId),
            splits: splits.map((s) => ({
              ...s,
              username: names.get(s.memberId),
              amountCents: s.amountCents.toString(),
            })),
            receiptImageId: receipt?.imageId ?? null,
            createdAt: expense.createdAt.toISOString(),
            updatedAt: expense.updatedAt.toISOString(),
            canEdit:
              access.status === 'ACTIVE' &&
              (access.isCreator || access.memberId === expense.recorderMemberId),
          }),
        };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  };

  return {
    createExpense,
    listExpenses,
    getExpense,
    updateExpense: notReady('updateExpense'),
    deleteExpense: notReady('deleteExpense'),
  };
}
