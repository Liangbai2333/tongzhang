import { endpoints, type CreateExpenseInput } from '@tongzhang/contracts';
import { allocateExpense, type SplitInput } from '@tongzhang/domain';
import type { Handler } from '../../http/context.js';
import { withTransaction, type Orm } from '../../db/transaction.js';
import { executeIdempotent } from '../../db/idempotency.js';
import { appendAudit } from '../../db/audit.js';
import { AppError } from '../../http/errors.js';
import { requireActive, requireExpenseEditor, requireLedgerMember } from '../ledgers/index.js';
import { receiptBinder } from '../images/index.js';
import type { ReceiptBinder } from './receipt.js';
import { queryExpenses } from './queries.js';
import { toExpenseDetailDto, type PersistedSplit } from './mapper.js';
import {
  clearExpenseReceipt,
  findActiveExpense,
  incrementLedgerVersion,
  insertExpenseWithSplits,
  lockLedger,
  readExpenseSplits,
  readMemberNames,
  readReceiptImageId,
  softDeleteExpenseRow,
  updateExpenseWithSplits,
} from './repository.js';

const MAX_PG_INTEGER = 2147483647;

export interface ExpensesService {
  createExpense: Handler<'createExpense'>;
  listExpenses: Handler<'listExpenses'>;
  getExpense: Handler<'getExpense'>;
  updateExpense: Handler<'updateExpense'>;
  deleteExpense: Handler<'deleteExpense'>;
}

type ExpenseSplitPayload = CreateExpenseInput extends infer U
  ? U extends CreateExpenseInput
    ? Pick<U, 'amountCents' | 'payerMemberId' | 'splitMode' | 'splits'>
    : never
  : never;

/** Validate ledger membership of payer/participants and recompute integer-cent splits on the server. */
export function computeExpenseAllocation(
  body: ExpenseSplitPayload,
  names: ReadonlyMap<string, string>,
): { total: bigint; splits: PersistedSplit[] } {
  if (!names.has(body.payerMemberId))
    throw new AppError('VALIDATION_ERROR', '付款人不是账本成员', 400);
  for (const s of body.splits)
    if (!names.has(s.memberId)) throw new AppError('VALIDATION_ERROR', '分摊成员不是账本成员', 400);

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
  return {
    total,
    splits: allocation.map((a) => ({
      memberId: a.memberId,
      shares: sharesBy.get(a.memberId) ?? null,
      amountCents: a.amountCents,
    })),
  };
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
          authorize: async () => {
            await requireLedgerMember(tx, ledgerId, userId);
          },
        },
        async () => {
          await lockLedger(tx, ledgerId);
          const access = await requireLedgerMember(tx, ledgerId, userId);
          requireActive(access);

          const names = await readMemberNames(tx, ledgerId);
          const { total, splits } = computeExpenseAllocation(body, names);
          const expense = await insertExpenseWithSplits(tx, {
            ledgerId,
            recorderMemberId: access.memberId,
            payerMemberId: body.payerMemberId,
            title: body.title,
            amountCents: total,
            category: body.category,
            occurredOn: body.occurredOn,
            splitMode: body.splitMode,
            note: body.note ?? null,
            splits,
          });
          const receiptImageId = body.receiptImageId ?? null;
          if (receiptImageId)
            await receipts.bind(tx, {
              ledgerId,
              expenseId: expense.id,
              imageId: receiptImageId,
              userId,
            });
          await incrementLedgerVersion(tx, ledgerId, new Date());
          await appendAudit(tx, {
            actorUserId: userId,
            ledgerId,
            action: 'EXPENSE_CREATED',
            targetType: 'EXPENSE',
            targetId: expense.id,
            requestId: context.requestId,
            details: { amountCents: body.amountCents, splitMode: body.splitMode },
          });

          return {
            data: toExpenseDetailDto({
              expense,
              splits,
              names,
              receiptImageId,
              canEdit: true,
            }),
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
        const expense = await findActiveExpense(tx, ledgerId, expenseId);
        if (!expense) throw new AppError('NOT_FOUND', '消费记录不存在', 404);
        const names = await readMemberNames(tx, ledgerId);
        const splits = await readExpenseSplits(tx, ledgerId, expense.id);
        const receiptImageId = await readReceiptImageId(tx, ledgerId, expense.id);
        return {
          data: toExpenseDetailDto({
            expense,
            splits,
            names,
            receiptImageId,
            canEdit:
              access.status === 'ACTIVE' &&
              (access.isCreator || access.memberId === expense.recorderMemberId),
          }),
        };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  };

  const updateExpense: Handler<'updateExpense'> = async (input, context) => {
    const userId = context.principal.userId;
    const { ledgerId, expenseId } = input.params;
    const body = input.body;

    const result = await withTransaction(db, (tx) =>
      executeIdempotent(
        tx,
        {
          userId,
          operation: `PATCH /api/v1/ledgers/${ledgerId}/expenses/${expenseId}`,
          key: context.idempotencyKey,
          request: { ledgerId, expenseId, body },
          responseStatus: 200,
          authorize: async () => {
            await requireLedgerMember(tx, ledgerId, userId);
          },
        },
        async () => {
          // Lock order: idempotency key -> ledger row -> receipt image asset row.
          await lockLedger(tx, ledgerId);
          const access = await requireLedgerMember(tx, ledgerId, userId);
          requireActive(access);

          const existing = await findActiveExpense(tx, ledgerId, expenseId);
          if (!existing) throw new AppError('NOT_FOUND', '消费记录不存在', 404);
          requireExpenseEditor(access, existing.recorderMemberId);
          if (existing.version !== body.version || existing.version >= MAX_PG_INTEGER)
            throw new AppError('VERSION_CONFLICT', '消费记录已更新，请刷新后重试', 409);

          const names = await readMemberNames(tx, ledgerId);
          const { total, splits } = computeExpenseAllocation(body, names);
          const now = new Date();
          const updated = await updateExpenseWithSplits(tx, {
            ledgerId,
            expenseId,
            expectedVersion: body.version,
            payerMemberId: body.payerMemberId,
            title: body.title,
            amountCents: total,
            category: body.category,
            occurredOn: body.occurredOn,
            splitMode: body.splitMode,
            note: body.note ?? null,
            splits,
            now,
          });

          const currentReceiptId = await readReceiptImageId(tx, ledgerId, expenseId);
          const nextReceiptId = body.receiptImageId ?? null;
          if (nextReceiptId !== currentReceiptId) {
            if (currentReceiptId !== null) await clearExpenseReceipt(tx, ledgerId, expenseId);
            if (nextReceiptId !== null)
              await receipts.bind(tx, {
                ledgerId,
                expenseId,
                imageId: nextReceiptId,
                userId,
              });
          }

          await incrementLedgerVersion(tx, ledgerId, now);
          await appendAudit(tx, {
            actorUserId: userId,
            ledgerId,
            action: 'EXPENSE_UPDATED',
            targetType: 'EXPENSE',
            targetId: updated.id,
            requestId: context.requestId,
            details: {
              amountCents: body.amountCents,
              splitMode: body.splitMode,
              version: updated.version,
            },
          });

          return {
            data: toExpenseDetailDto({
              expense: updated,
              splits,
              names,
              receiptImageId: nextReceiptId,
              canEdit: true,
            }),
          };
        },
      ),
    );
    return result.body as Awaited<ReturnType<Handler<'updateExpense'>>>;
  };

  const deleteExpense: Handler<'deleteExpense'> = async (input, context) => {
    const userId = context.principal.userId;
    const { ledgerId, expenseId } = input.params;
    const { version } = input.query;
    if (version > MAX_PG_INTEGER) throw new AppError('VALIDATION_ERROR', '请求参数不正确', 400);

    const result = await withTransaction(db, (tx) =>
      executeIdempotent(
        tx,
        {
          userId,
          operation: `DELETE /api/v1/ledgers/${ledgerId}/expenses/${expenseId}`,
          key: context.idempotencyKey,
          request: { ledgerId, expenseId, version },
          responseStatus: 200,
          authorize: async () => {
            await requireLedgerMember(tx, ledgerId, userId);
          },
        },
        async () => {
          await lockLedger(tx, ledgerId);
          const access = await requireLedgerMember(tx, ledgerId, userId);
          requireActive(access);

          const existing = await findActiveExpense(tx, ledgerId, expenseId);
          if (!existing) throw new AppError('NOT_FOUND', '消费记录不存在', 404);
          requireExpenseEditor(access, existing.recorderMemberId);
          if (existing.version !== version)
            throw new AppError('VERSION_CONFLICT', '消费记录已更新，请刷新后重试', 409);

          const deletedAt = new Date();
          await softDeleteExpenseRow(tx, {
            ledgerId,
            expenseId,
            expectedVersion: version,
            deletedAt,
          });
          await incrementLedgerVersion(tx, ledgerId, deletedAt);
          await appendAudit(tx, {
            actorUserId: userId,
            ledgerId,
            action: 'EXPENSE_DELETED',
            targetType: 'EXPENSE',
            targetId: existing.id,
            requestId: context.requestId,
            details: { version: existing.version },
          });

          return endpoints.deleteExpense.response.parse({
            data: { deletedId: existing.id },
          });
        },
      ),
    );
    return result.body;
  };

  return {
    createExpense,
    listExpenses,
    getExpense,
    updateExpense,
    deleteExpense,
  };
}
