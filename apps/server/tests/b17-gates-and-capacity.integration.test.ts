import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { z } from 'zod';
import { endpoints, errorResponseSchema } from '@tongzhang/contracts';
import {
  idempotencyKeys,
  ledgerMembers,
  ledgers,
  notifications,
  users,
} from '../src/db/schema/index.js';
import { integrationFixture, type TestAccount } from './fixtures/integration.js';
import { createExpense, seedMultiMemberLedger } from './fixtures/expenses.js';
import { waitForBlockedQueries } from './fixtures/locks.js';

type Response = { statusCode: number; json: () => unknown };
let fixture: Awaited<ReturnType<typeof integrationFixture>>;

beforeEach(async () => {
  fixture = await integrationFixture();
});

afterEach(async () => {
  await fixture.close();
});

function parseOk<T>(res: Response, schema: z.ZodType<T>, status = 200): T {
  expect(res.statusCode).toBe(status);
  return schema.parse(res.json());
}

function expectErr(res: Response, status: number, code: string) {
  expect(res.statusCode).toBe(status);
  expect(errorResponseSchema.parse(res.json()).error.code).toBe(code);
}

const headers = (account: TestAccount, key?: string) => ({
  authorization: `Bearer ${account.accessToken}`,
  ...(key === undefined ? {} : { 'idempotency-key': key }),
});

describe('B17 isolated-DB regressions: 12th-seat row-lock race & 401 backend gates', () => {
  it('allows exactly 1 of 3 concurrent joiners to take the 12th seat and leaves loser idempotency keys unconsumed', async () => {
    const owner = await fixture.register('满员建账人');
    const racers = [
      await fixture.register('竞态甲'),
      await fixture.register('竞态乙'),
      await fixture.register('竞态丙'),
    ];
    const created = parseOk(
      await fixture.app.inject({
        method: 'POST',
        url: '/api/v1/ledgers',
        headers: headers(owner, randomUUID()),
        payload: { name: '12人满员行锁回归', coverKey: 'plain' },
      }),
      endpoints.createLedger.response,
      201,
    ).data;

    // Fill seats 2..11 so only the 12th seat remains.
    const seededUsers = await Promise.all(
      Array.from({ length: 10 }, (_, idx) => fixture.seedUser(`已占位成员${idx + 2}`)),
    );
    await fixture.db.orm
      .insert(ledgerMembers)
      .values(seededUsers.map((userId) => ({ ledgerId: created.ledger.id, userId })));

    const racerKeys = racers.map(() => randomUUID());
    const blocker = await fixture.db.pool.connect();
    const pending: Array<Promise<Response>> = [];
    try {
      await blocker.query('BEGIN');
      const pid = (await blocker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!
        .pid;
      await blocker.query('SELECT id FROM ledgers WHERE id = $1 FOR UPDATE', [created.ledger.id]);
      for (let i = 0; i < racers.length; i++) {
        pending.push(
          fixture.app.inject({
            method: 'POST',
            url: '/api/v1/invitations/join',
            headers: headers(racers[i]!, racerKeys[i]!),
            payload: { code: created.invitation.code },
          }),
        );
      }
      await waitForBlockedQueries(fixture.db.pool, pid, 3);
      await blocker.query('COMMIT');
    } finally {
      try {
        await blocker.query('ROLLBACK');
      } finally {
        blocker.release();
      }
    }

    const results = await Promise.all(pending);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409, 409]);

    const winnerIdx = results.findIndex((r) => r.statusCode === 200);
    const loserIndices = results
      .map((r, idx) => (r.statusCode === 409 ? idx : -1))
      .filter((idx) => idx >= 0);
    expect(winnerIdx).toBeGreaterThanOrEqual(0);
    expect(loserIndices).toHaveLength(2);

    const winnerBody = parseOk(results[winnerIdx]!, endpoints.joinLedger.response);
    expect(winnerBody.data).toMatchObject({ ledgerId: created.ledger.id, alreadyMember: false });
    for (const idx of loserIndices) {
      expectErr(results[idx]!, 409, 'MEMBER_LIMIT_REACHED');
    }

    // Strictly 12 members in DB, ledger version incremented by exactly 1.
    const memberRows = await fixture.db.orm
      .select()
      .from(ledgerMembers)
      .where(eq(ledgerMembers.ledgerId, created.ledger.id));
    expect(memberRows).toHaveLength(12);
    const [ledgerRow] = await fixture.db.orm
      .select()
      .from(ledgers)
      .where(eq(ledgers.id, created.ledger.id));
    expect(ledgerRow!.version).toBe(2);

    // Winner's key is recorded; losers' keys must NOT be stored as completed idempotency records.
    const winnerStored = await fixture.db.orm
      .select()
      .from(idempotencyKeys)
      .where(eq(idempotencyKeys.key, racerKeys[winnerIdx]!));
    expect(winnerStored).toHaveLength(1);
    for (const idx of loserIndices) {
      const loserStored = await fixture.db.orm
        .select()
        .from(idempotencyKeys)
        .where(eq(idempotencyKeys.key, racerKeys[idx]!));
      expect(loserStored).toHaveLength(0);
    }

    // Preview after capacity is reached reports memberCount=12 and canJoin=false.
    const previewFull = parseOk(
      await fixture.app.inject({
        method: 'POST',
        url: '/api/v1/invitations/preview',
        headers: headers(racers[loserIndices[0]!]!),
        payload: { code: created.invitation.code },
      }),
      endpoints.previewJoin.response,
    ).data;
    expect(previewFull).toMatchObject({ memberCount: 12, canJoin: false });
  });

  it('rejects revoked tokens with 401 UNAUTHENTICATED across Beta endpoints A16/A17/A21/A28/A29/A31/A32/A33/A34 with zero writes', async () => {
    const ledger = await seedMultiMemberLedger(fixture, ['小安', '小白']);
    const { 小安: an, 小白: bai } = ledger.byName;
    const expense = await createExpense(fixture, ledger, an!, {
      title: '401门禁测试',
      amountCents: '8000',
      payer: an!,
    });

    // Freeze to get a real transferId for A32, then create a real notification for A34.
    const [ledgerBefore] = await fixture.db.orm
      .select()
      .from(ledgers)
      .where(eq(ledgers.id, ledger.ledgerId));
    const settlement = parseOk(
      await fixture.app.inject({
        method: 'POST',
        url: `/api/v1/ledgers/${ledger.ledgerId}/settlement`,
        headers: headers(an!.account, randomUUID()),
        payload: { expectedVersion: ledgerBefore!.version },
      }),
      endpoints.startSettlement.response,
      201,
    ).data;
    const transferId = settlement.batch.transfers[0]!.id;

    // Revoke 小安's session via A04 logout.
    parseOk(
      await fixture.app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        headers: headers(an!.account),
      }),
      endpoints.logout.response,
    );

    const [versionSnapshot] = await fixture.db.orm
      .select()
      .from(ledgers)
      .where(eq(ledgers.id, ledger.ledgerId));
    const [userSnapshot] = await fixture.db.orm
      .select()
      .from(users)
      .where(eq(users.id, an!.account.user.id));
    const notifCountBefore = (
      await fixture.db.orm
        .select()
        .from(notifications)
        .where(eq(notifications.recipientUserId, bai!.account.user.id))
    ).length;

    const revokedRequests = [
      {
        method: 'PATCH' as const,
        url: `/api/v1/ledgers/${ledger.ledgerId}/expenses/${expense.id}`,
        payload: {
          title: '越权修改',
          amountCents: '9000',
          category: 'DINING',
          occurredOn: '2026-11-20',
          payerMemberId: an!.memberId,
          splitMode: 'EQUAL',
          splits: [{ memberId: an!.memberId }, { memberId: bai!.memberId }],
          version: 1,
        },
      },
      {
        method: 'DELETE' as const,
        url: `/api/v1/ledgers/${ledger.ledgerId}/expenses/${expense.id}?version=1`,
      },
      { method: 'GET' as const, url: `/api/v1/ledgers/${ledger.ledgerId}/statistics` },
      { method: 'PATCH' as const, url: '/api/v1/me', payload: { username: '失效改名' } },
      {
        method: 'PATCH' as const,
        url: '/api/v1/me/preferences',
        payload: { notificationEnabled: false },
      },
      {
        method: 'POST' as const,
        url: `/api/v1/ledgers/${ledger.ledgerId}/expenses/ai-draft`,
        payload: { text: '食堂 120 元' },
      },
      {
        method: 'POST' as const,
        url: `/api/v1/ledgers/${ledger.ledgerId}/settlement/transfers/${transferId}/remind`,
        payload: { note: '请核对' },
      },
      { method: 'GET' as const, url: '/api/v1/me/notifications' },
      { method: 'POST' as const, url: `/api/v1/me/notifications/${randomUUID()}/read` },
    ];

    for (const req of revokedRequests) {
      const res = await fixture.app.inject({
        ...req,
        headers: headers(an!.account, randomUUID()),
      });
      expectErr(res, 401, 'UNAUTHENTICATED');
    }

    // Zero side effects in database.
    const [versionAfter] = await fixture.db.orm
      .select()
      .from(ledgers)
      .where(eq(ledgers.id, ledger.ledgerId));
    const [userAfter] = await fixture.db.orm
      .select()
      .from(users)
      .where(eq(users.id, an!.account.user.id));
    const notifCountAfter = (
      await fixture.db.orm
        .select()
        .from(notifications)
        .where(eq(notifications.recipientUserId, bai!.account.user.id))
    ).length;
    expect(versionAfter!.version).toBe(versionSnapshot!.version);
    expect(userAfter!.username).toBe(userSnapshot!.username);
    expect(userAfter!.notificationEnabled).toBe(userSnapshot!.notificationEnabled);
    expect(notifCountAfter).toBe(notifCountBefore);
  });
});
