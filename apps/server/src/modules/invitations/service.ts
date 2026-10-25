import { and, count, eq, isNull, sql } from 'drizzle-orm';
import { MAX_LEDGER_MEMBERS } from '@tongzhang/contracts';
import type { Handler } from '../../http/context.js';
import { withTransaction, type DatabaseExecutor, type Orm } from '../../db/transaction.js';
import { executeIdempotent } from '../../db/idempotency.js';
import { appendAudit } from '../../db/audit.js';
import { invitations, ledgerMembers, ledgers, users } from '../../db/schema/index.js';
import { AppError } from '../../http/errors.js';
import { requireActive, requireCreator, requireLedgerMember } from '../ledgers/index.js';
import { issueInvitation, toInvitationDto } from './issue.js';

export interface InvitationsService {
  getInvitation: Handler<'getInvitation'>;
  resetInvitation: Handler<'resetInvitation'>;
  previewJoin: Handler<'previewJoin'>;
  joinLedger: Handler<'joinLedger'>;
}

const invalidCode = () => new AppError('INVITE_INVALID', '邀请码无效，请核对后重试', 400);
const expiredCode = () => new AppError('INVITE_EXPIRED', '邀请码已过期，请联系创建者重新生成', 409);

function requireUser(context: { principal: { userId: string } | null }) {
  if (!context.principal) throw new AppError('UNAUTHENTICATED', '请先登录', 401);
  return context.principal.userId;
}

/** A revoked (replaced) code is indistinguishable from one that never existed. */
async function findInvitation(db: DatabaseExecutor, code: string) {
  const [row] = await db
    .select({
      id: invitations.id,
      ledgerId: invitations.ledgerId,
      expiresAt: invitations.expiresAt,
      revokedAt: invitations.revokedAt,
    })
    .from(invitations)
    .where(eq(invitations.code, code))
    .limit(1);
  if (!row || row.revokedAt) throw invalidCode();
  return row;
}

export function createInvitationsService(db: Orm): InvitationsService {
  const getInvitation: Handler<'getInvitation'> = async (input, context) => {
    const userId = requireUser(context);
    const { ledgerId } = input.params;
    const access = await requireLedgerMember(db, ledgerId, userId);
    requireCreator(access);
    const [current] = await db
      .select()
      .from(invitations)
      .where(and(eq(invitations.ledgerId, ledgerId), isNull(invitations.revokedAt)))
      .limit(1);
    if (!current) throw new AppError('INVITE_INVALID', '当前没有可用邀请，请重新生成', 409);
    return { data: toInvitationDto(current) };
  };

  const resetInvitation: Handler<'resetInvitation'> = async (input, context) => {
    const userId = requireUser(context);
    if (!context.idempotencyKey)
      throw new AppError('VALIDATION_ERROR', '缺少有效的 Idempotency-Key', 400);
    const ledgerId = input.params.ledgerId.toLowerCase();
    const result = await withTransaction(db, (tx) =>
      executeIdempotent(
        tx,
        {
          userId,
          operation: `POST /api/v1/ledgers/${ledgerId}/invitation/reset`,
          key: context.idempotencyKey!,
          request: { ledgerId },
          responseStatus: 200,
          authorize: async () => {
            requireCreator(await requireLedgerMember(tx, ledgerId, userId));
          },
        },
        async () => {
          await tx
            .select({ id: ledgers.id })
            .from(ledgers)
            .where(eq(ledgers.id, ledgerId))
            .for('update');
          const access = await requireLedgerMember(tx, ledgerId, userId);
          requireCreator(access);
          requireActive(access);
          // Revoke first: only one non-revoked code may exist per ledger.
          await tx
            .update(invitations)
            .set({ revokedAt: new Date() })
            .where(and(eq(invitations.ledgerId, ledgerId), isNull(invitations.revokedAt)));
          const fresh = await issueInvitation(tx, {
            ledgerId,
            createdByMemberId: access.memberId,
          });
          await appendAudit(tx, {
            actorUserId: userId,
            ledgerId,
            action: 'INVITATION_RESET',
            targetType: 'INVITATION',
            targetId: fresh.id,
            requestId: context.requestId,
          });
          return { data: toInvitationDto(fresh) };
        },
      ),
    );
    return result.body as Awaited<ReturnType<Handler<'resetInvitation'>>>;
  };

  const previewJoin: Handler<'previewJoin'> = async (input, context) => {
    const userId = requireUser(context);
    // Read-only: no lock, no write, no idempotency key.
    return db.transaction(
      async (tx) => {
        const invitation = await findInvitation(tx, input.body.code);
        const [info] = await tx
          .select({
            ledgerId: ledgers.id,
            name: ledgers.name,
            status: ledgers.status,
            creatorName: users.username,
          })
          .from(ledgers)
          .innerJoin(users, eq(users.id, ledgers.createdByUserId))
          .where(eq(ledgers.id, invitation.ledgerId));
        if (!info) throw invalidCode();
        const [member] = await tx
          .select({ id: ledgerMembers.id })
          .from(ledgerMembers)
          .where(and(eq(ledgerMembers.ledgerId, info.ledgerId), eq(ledgerMembers.userId, userId)))
          .limit(1);
        // A current member may still see the preview; strangers cannot use an expired code.
        if (!member && invitation.expiresAt <= new Date()) throw expiredCode();
        const [{ total }] = (await tx
          .select({ total: count() })
          .from(ledgerMembers)
          .where(eq(ledgerMembers.ledgerId, info.ledgerId))) as [{ total: number }];
        return {
          data: {
            ledgerId: info.ledgerId,
            name: info.name,
            creatorName: info.creatorName,
            memberCount: total,
            alreadyMember: Boolean(member),
            canJoin: !member && info.status === 'ACTIVE' && total < MAX_LEDGER_MEMBERS,
          },
        };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  };

  const joinLedger: Handler<'joinLedger'> = async (input, context) => {
    const userId = requireUser(context);
    if (!context.idempotencyKey)
      throw new AppError('VALIDATION_ERROR', '缺少有效的 Idempotency-Key', 400);
    const code = input.body.code;
    const result = await withTransaction(db, (tx) =>
      executeIdempotent(
        tx,
        {
          userId,
          operation: 'POST /api/v1/invitations/join',
          key: context.idempotencyKey!,
          request: { code },
          responseStatus: 200,
          // Any signed-in user may present a code; the code itself is validated in the work step.
          authorize: async () => undefined,
        },
        async () => {
          const found = await findInvitation(tx, code);
          // Same lock as expense writes: member counting and insertion are serialized per ledger.
          const [ledger] = await tx
            .select({ id: ledgers.id, status: ledgers.status })
            .from(ledgers)
            .where(eq(ledgers.id, found.ledgerId))
            .for('update');
          if (!ledger) throw invalidCode();
          // Re-read after the lock: a concurrent reset may have revoked this code.
          const invitation = await findInvitation(tx, code);
          const [existing] = await tx
            .select({ id: ledgerMembers.id })
            .from(ledgerMembers)
            .where(and(eq(ledgerMembers.ledgerId, ledger.id), eq(ledgerMembers.userId, userId)))
            .limit(1);
          if (existing)
            return { data: { ledgerId: ledger.id, memberId: existing.id, alreadyMember: true } };
          if (invitation.expiresAt <= new Date()) throw expiredCode();
          if (ledger.status !== 'ACTIVE')
            throw new AppError('LEDGER_FROZEN', '账本已进入结算，无法加入', 409);
          const [{ total }] = (await tx
            .select({ total: count() })
            .from(ledgerMembers)
            .where(eq(ledgerMembers.ledgerId, ledger.id))) as [{ total: number }];
          if (total >= MAX_LEDGER_MEMBERS)
            throw new AppError('MEMBER_LIMIT_REACHED', '账本成员已达 12 人上限', 409);
          const [member] = await tx
            .insert(ledgerMembers)
            .values({ ledgerId: ledger.id, userId })
            .returning({ id: ledgerMembers.id });
          await tx
            .update(ledgers)
            .set({ version: sql`${ledgers.version} + 1`, updatedAt: new Date() })
            .where(eq(ledgers.id, ledger.id));
          await appendAudit(tx, {
            actorUserId: userId,
            ledgerId: ledger.id,
            action: 'MEMBER_JOINED',
            targetType: 'LEDGER_MEMBER',
            targetId: member!.id,
            requestId: context.requestId,
            details: { invitationId: invitation.id },
          });
          return { data: { ledgerId: ledger.id, memberId: member!.id, alreadyMember: false } };
        },
      ),
    );
    return result.body as Awaited<ReturnType<Handler<'joinLedger'>>>;
  };

  return { getInvitation, resetInvitation, previewJoin, joinLedger };
}
