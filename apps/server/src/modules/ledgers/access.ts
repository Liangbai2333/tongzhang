import { and, eq } from 'drizzle-orm';
import { ledgerStatusSchema } from '@tongzhang/contracts';
import type { DatabaseExecutor } from '../../db/transaction.js';
import { ledgers, ledgerMembers } from '../../db/schema/index.js';
import { AppError } from '../../http/errors.js';
import type { LedgerAccess } from './policy.js';

/** Resolve membership from the database on every operation, including before replay. */
export async function requireLedgerMember(
  db: DatabaseExecutor,
  ledgerId: string,
  userId: string,
): Promise<LedgerAccess> {
  const [member] = await db
    .select({
      memberId: ledgerMembers.id,
      creatorId: ledgers.createdByUserId,
      status: ledgers.status,
    })
    .from(ledgerMembers)
    .innerJoin(ledgers, eq(ledgerMembers.ledgerId, ledgers.id))
    .where(and(eq(ledgerMembers.ledgerId, ledgerId), eq(ledgerMembers.userId, userId)))
    .limit(1);
  // Use the same response for a missing ledger and a ledger owned by other users.
  if (!member) throw new AppError('FORBIDDEN', '你没有权限访问此账本', 403);
  return {
    memberId: member.memberId,
    isCreator: member.creatorId === userId,
    status: ledgerStatusSchema.parse(member.status),
  };
}
