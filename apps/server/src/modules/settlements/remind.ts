import { eq } from 'drizzle-orm';
import { endpoints, type LedgerStatus } from '@tongzhang/contracts';
import type { Handler } from '../../http/context.js';
import { AppError } from '../../http/errors.js';
import { withTransaction, type Orm, type Transaction } from '../../db/transaction.js';
import { executeIdempotent } from '../../db/idempotency.js';
import { appendAudit } from '../../db/audit.js';
import { ledgers } from '../../db/schema/index.js';
import { requireLedgerMember, type LedgerAccess } from '../ledgers/index.js';
import { deliverSettlementReminderNotification } from '../profile/index.js';
import { findLatestTransferReminder, readMemberUserId, readTransfer } from './repository.js';

export const DEFAULT_REMINDER_COOLDOWN_MS = 6 * 60 * 60 * 1000;

export interface RemindTransferOptions {
  cooldownMs?: number;
  now?: () => Date;
}

async function lockLedger(tx: Transaction, ledgerId: string) {
  const [ledger] = await tx.select().from(ledgers).where(eq(ledgers.id, ledgerId)).for('update');
  if (!ledger) throw new AppError('FORBIDDEN', '你没有权限访问此账本', 403);
  return ledger;
}

/**
 * Only the transfer's payee or the ledger creator (when not the payer) may send a reminder.
 * Replays keep checking membership and role even after the transfer is PAID or the ledger SETTLED.
 */
export function requireReminderRole(
  access: LedgerAccess,
  transfer: { payerMemberId: string; payeeMemberId: string },
) {
  if (access.memberId === transfer.payerMemberId) {
    throw new AppError('FORBIDDEN', '付款人不能向自己发起催还', 403);
  }
  if (!access.isCreator && access.memberId !== transfer.payeeMemberId) {
    throw new AppError('FORBIDDEN', '只有收款人或账本创建者可发起催还', 403);
  }
}

export function requireRemindableState(ledgerStatus: LedgerStatus, transferStatus: string) {
  if (ledgerStatus !== 'SETTLING') {
    throw new AppError('LEDGER_STATE_INVALID', '只有结算中的账本可发起催还', 409);
  }
  if (transferStatus !== 'PENDING') {
    throw new AppError('LEDGER_STATE_INVALID', '该笔转账已登记已还，无需催还', 409);
  }
}

export function assertReminderNotInCooldown(
  lastRemindedAt: Date | null,
  now: Date,
  cooldownMs: number,
) {
  if (!lastRemindedAt) return;
  if (now.getTime() < lastRemindedAt.getTime() + cooldownMs) {
    throw new AppError('REMINDER_COOLDOWN', '该笔转账仍在催还冷却期内，请稍后再试', 429);
  }
}

export function createRemindTransfer(
  db: Orm,
  options: RemindTransferOptions = {},
): Handler<'remindTransfer'> {
  const cooldownMs = options.cooldownMs ?? DEFAULT_REMINDER_COOLDOWN_MS;
  const getNow = options.now ?? (() => new Date());

  return async (input, context) => {
    const userId = context.principal.userId;
    const ledgerId = input.params.ledgerId;
    const transferId = input.params.transferId;
    const result = await withTransaction(db, (tx) =>
      executeIdempotent(
        tx,
        {
          userId,
          operation: `POST /api/v1/ledgers/${ledgerId}/settlement/transfers/${transferId}/remind`,
          key: context.idempotencyKey,
          request: { ledgerId, transferId, body: input.body },
          responseStatus: 200,
          authorize: async () => {
            const access = await requireLedgerMember(tx, ledgerId, userId);
            if (access.status === 'ACTIVE') {
              throw new AppError('LEDGER_STATE_INVALID', '只有结算中的账本可发起催还', 409);
            }
            const transfer = await readTransfer(tx, ledgerId, transferId);
            requireReminderRole(access, transfer);
          },
        },
        async () => {
          await lockLedger(tx, ledgerId);
          const access = await requireLedgerMember(tx, ledgerId, userId);
          const transfer = await readTransfer(tx, ledgerId, transferId);
          requireReminderRole(access, transfer);
          requireRemindableState(access.status, transfer.status);

          const now = getNow();
          const lastRemindedAt = await findLatestTransferReminder(tx, ledgerId, transferId);
          assertReminderNotInCooldown(lastRemindedAt, now, cooldownMs);

          const payerUserId = await readMemberUserId(tx, ledgerId, transfer.payerMemberId);
          await deliverSettlementReminderNotification(tx, {
            recipientUserId: payerUserId,
            actorUserId: userId,
            ledgerId,
            transferId,
            amountCents: transfer.amountCents,
            note: input.body.note ?? null,
            createdAt: now,
          });

          const cooldownEndsAt = new Date(now.getTime() + cooldownMs);
          await appendAudit(tx, {
            actorUserId: userId,
            ledgerId,
            action: 'TRANSFER_REMINDED',
            targetType: 'SETTLEMENT_TRANSFER',
            targetId: transferId,
            requestId: context.requestId,
            createdAt: now,
            details: {
              remindedAt: now.toISOString(),
              cooldownEndsAt: cooldownEndsAt.toISOString(),
            },
          });

          return endpoints.remindTransfer.response.parse({
            data: {
              ledgerId,
              transferId,
              remindedAt: now.toISOString(),
              cooldownEndsAt: cooldownEndsAt.toISOString(),
            },
          });
        },
      ),
    );
    return result.body;
  };
}
