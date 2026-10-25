import { and, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { uuidSchema } from '@tongzhang/contracts';
import type { Handler } from '../../http/context.js';
import { notReady } from '../../http/not-ready.js';
import { withTransaction, type Orm } from '../../db/transaction.js';
import { executeIdempotent } from '../../db/idempotency.js';
import { appendAudit } from '../../db/audit.js';
import { ledgerMembers, ledgers } from '../../db/schema/index.js';
import { AppError } from '../../http/errors.js';
import { issueInvitation, toInvitationDto } from '../invitations/index.js';
import { requireLedgerMember } from './access.js';
import { loadFigures, loadMembers, toSummary } from './views.js';

export interface LedgersService {
  createLedger: Handler<'createLedger'>;
  listLedgers: Handler<'listLedgers'>;
  getLedger: Handler<'getLedger'>;
  listMembers: Handler<'listMembers'>;
  archiveLedger: Handler<'archiveLedger'>;
}

const READ_ONLY = { isolationLevel: 'repeatable read', accessMode: 'read only' } as const;
const badCursor = () => new AppError('VALIDATION_ERROR', '分页游标无效', 400);

/** Reject impossible dates (month 99, Feb 30) that PostgreSQL would fail to cast. */
function isRealInstant(at: string) {
  // JavaScript accepts year zero, but PostgreSQL timestamps do not.
  if (at.startsWith('0000-')) return false;
  const seconds = at.slice(0, 19);
  const date = new Date(`${seconds}Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(seconds);
}

/** Cursor = last (joined_at, member id); the timestamp keeps microsecond precision as text. */
function decodeCursor(cursor: string) {
  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as unknown;
    if (Array.isArray(value) && value.length === 2) {
      const [at, id] = value as unknown[];
      if (
        typeof at === 'string' &&
        typeof id === 'string' &&
        /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/.test(at) &&
        isRealInstant(at) &&
        uuidSchema.safeParse(id).success
      )
        return { at, id };
    }
  } catch {
    // fall through
  }
  throw badCursor();
}
const encodeCursor = (at: string, id: string) =>
  Buffer.from(JSON.stringify([at, id])).toString('base64url');

export function createLedgersService(db: Orm): LedgersService {
  const createLedger: Handler<'createLedger'> = async (input, context) => {
    if (!context.principal) throw new AppError('UNAUTHENTICATED', '请先登录', 401);
    if (!context.idempotencyKey)
      throw new AppError('VALIDATION_ERROR', '缺少有效的 Idempotency-Key', 400);
    const userId = context.principal.userId;
    const body = input.body;
    // Custom cover images belong to the image module; reject instead of silently dropping them.
    if (body.coverImageId)
      throw new AppError('FEATURE_NOT_READY', '自定义封面图片暂未开放，请选择预设封面', 501);

    const result = await withTransaction(db, (tx) =>
      executeIdempotent(
        tx,
        {
          userId,
          operation: 'POST /api/v1/ledgers',
          key: context.idempotencyKey!,
          request: { body },
          responseStatus: 201,
          // Creating a ledger needs only a signed-in user; there is no ledger to check yet.
          authorize: async () => undefined,
        },
        async () => {
          const [ledger] = await tx
            .insert(ledgers)
            .values({ createdByUserId: userId, name: body.name, coverKey: body.coverKey })
            .returning();
          const [member] = await tx
            .insert(ledgerMembers)
            .values({ ledgerId: ledger!.id, userId })
            .returning({ id: ledgerMembers.id });
          const invitation = await issueInvitation(tx, {
            ledgerId: ledger!.id,
            createdByMemberId: member!.id,
          });
          await appendAudit(tx, {
            actorUserId: userId,
            ledgerId: ledger!.id,
            action: 'LEDGER_CREATED',
            targetType: 'LEDGER',
            targetId: ledger!.id,
            requestId: context.requestId,
          });
          const figures = (await loadFigures(tx, [ledger!.id])).get(ledger!.id)!;
          return {
            data: {
              ledger: toSummary(ledger!, figures, member!.id, null),
              invitation: toInvitationDto(invitation),
            },
          };
        },
      ),
    );
    return result.body as Awaited<ReturnType<Handler<'createLedger'>>>;
  };

  const listLedgers: Handler<'listLedgers'> = async (input, context) => {
    if (!context.principal) throw new AppError('UNAUTHENTICATED', '请先登录', 401);
    const userId = context.principal.userId;
    const { archived, limit, cursor } = input.query;
    const after = cursor ? decodeCursor(cursor) : null;
    return db.transaction(async (tx) => {
      const joinedText = sql<string>`to_char(${ledgerMembers.joinedAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
      const rows = await tx
        .select({
          ledger: ledgers,
          memberId: ledgerMembers.id,
          archivedAt: ledgerMembers.archivedAt,
          joinedText,
        })
        .from(ledgerMembers)
        .innerJoin(ledgers, eq(ledgers.id, ledgerMembers.ledgerId))
        .where(
          and(
            eq(ledgerMembers.userId, userId),
            archived ? isNotNull(ledgerMembers.archivedAt) : isNull(ledgerMembers.archivedAt),
            after
              ? sql`(${ledgerMembers.joinedAt}, ${ledgerMembers.id}) < (${after.at}::timestamptz, ${after.id}::uuid)`
              : undefined,
          ),
        )
        .orderBy(desc(ledgerMembers.joinedAt), desc(ledgerMembers.id))
        .limit(limit + 1);
      const page = rows.slice(0, limit);
      const ids = page.map((r) => r.ledger.id);
      const figures = await loadFigures(tx, ids);
      const last = page.at(-1);
      return {
        data: page.map((r) =>
          toSummary(r.ledger, figures.get(r.ledger.id)!, r.memberId, r.archivedAt),
        ),
        page: {
          nextCursor:
            rows.length > limit && last ? encodeCursor(last.joinedText, last.memberId) : null,
        },
      };
    }, READ_ONLY);
  };

  const getLedger: Handler<'getLedger'> = async (input, context) => {
    if (!context.principal) throw new AppError('UNAUTHENTICATED', '请先登录', 401);
    const userId = context.principal.userId;
    return db.transaction(async (tx) => {
      // Membership first: a stranger gets the same 403 for missing and foreign ledgers.
      const access = await requireLedgerMember(tx, input.params.ledgerId, userId);
      const [row] = await tx
        .select({ ledger: ledgers, archivedAt: ledgerMembers.archivedAt })
        .from(ledgerMembers)
        .innerJoin(ledgers, eq(ledgers.id, ledgerMembers.ledgerId))
        .where(eq(ledgerMembers.id, access.memberId));
      const ledger = row!.ledger;
      const figures = (await loadFigures(tx, [ledger.id])).get(ledger.id)!;
      const members = await loadMembers(tx, ledger.id, ledger.createdByUserId, figures);
      const mine = figures.balances.get(access.memberId)!;
      return {
        data: {
          ...toSummary(ledger, figures, access.memberId, row!.archivedAt),
          creatorUserId: ledger.createdByUserId,
          myMemberId: access.memberId,
          myPaidCents: mine.paidCents.toString(),
          mySharedCents: mine.sharedCents.toString(),
          myNetCents: mine.netCents.toString(),
          members,
        },
      };
    }, READ_ONLY);
  };

  const listMembers: Handler<'listMembers'> = async (input, context) => {
    if (!context.principal) throw new AppError('UNAUTHENTICATED', '请先登录', 401);
    const userId = context.principal.userId;
    return db.transaction(async (tx) => {
      await requireLedgerMember(tx, input.params.ledgerId, userId);
      const [ledger] = await tx
        .select({ id: ledgers.id, creator: ledgers.createdByUserId })
        .from(ledgers)
        .where(eq(ledgers.id, input.params.ledgerId));
      const figures = (await loadFigures(tx, [ledger!.id])).get(ledger!.id)!;
      return { data: await loadMembers(tx, ledger!.id, ledger!.creator, figures) };
    }, READ_ONLY);
  };

  // Personal archive is the next task (A27): membership is checked, then it stays explicit 501.
  const archiveLedger: Handler<'archiveLedger'> = async (input, context) => {
    if (!context.principal) throw new AppError('UNAUTHENTICATED', '请先登录', 401);
    await requireLedgerMember(db, input.params.ledgerId, context.principal.userId);
    return notReady('archiveLedger')(input, context);
  };

  return { createLedger, listLedgers, getLedger, listMembers, archiveLedger };
}
