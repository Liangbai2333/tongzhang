import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { z } from 'zod';
import { endpoints, errorResponseSchema } from '@tongzhang/contracts';
import { invitations, ledgerMembers } from '../src/db/schema/index.js';
import { integrationFixture, type TestAccount } from './fixtures/integration.js';
import { waitForBlockedQueries } from './fixtures/locks.js';

type Response = { statusCode: number; json: () => unknown };
let fixture: Awaited<ReturnType<typeof integrationFixture>>;
let closed: boolean;
beforeEach(async () => {
  fixture = await integrationFixture();
  closed = false;
});
afterEach(async () => {
  if (!closed) await fixture.close();
});

function success<T>(response: Response, schema: z.ZodType<T>, status = 200) {
  expect(response.statusCode).toBe(status);
  const body = schema.parse(response.json());
  // Assert the complete wire response, including envelopes and unexpected leaked fields.
  expect(response.json()).toEqual(body);
  return body;
}
function rejected(response: Response, status: number, code: string) {
  expect(response.statusCode).toBe(status);
  const body = errorResponseSchema.parse(response.json());
  expect(response.json()).toEqual(body);
  expect(body.error.code).toBe(code);
  expect(body.requestId).not.toBe('');
}
const headers = (account: TestAccount, key?: string) => ({
  authorization: `Bearer ${account.accessToken}`,
  ...(key === undefined ? {} : { 'idempotency-key': key }),
});
const get = (account: TestAccount, url: string) =>
  fixture.app.inject({ url, headers: headers(account) });
async function create(account: TestAccount, name = 'Independent ledger regression') {
  return success(
    await fixture.app.inject({
      method: 'POST',
      url: '/api/v1/ledgers',
      headers: headers(account, randomUUID()),
      payload: { name, coverKey: 'plain' },
    }),
    endpoints.createLedger.response,
    201,
  ).data;
}
const preview = (account: TestAccount, code: string) =>
  fixture.app.inject({
    method: 'POST',
    url: '/api/v1/invitations/preview',
    headers: headers(account),
    payload: { code },
  });
const join = (account: TestAccount, code: string, key = randomUUID()) =>
  fixture.app.inject({
    method: 'POST',
    url: '/api/v1/invitations/join',
    headers: headers(account, key),
    payload: { code },
  });

/** Count committed effects for this ledger only, including production replay records. */
async function effects(ledgerId: string) {
  const result = await fixture.db.pool.query<{
    version: number;
    members: number;
    invitations: number;
    audits: number;
    replays: number;
  }>(
    `SELECT l.version,
      (SELECT count(*)::int FROM ledger_members WHERE ledger_id=l.id) AS members,
      (SELECT count(*)::int FROM invitations WHERE ledger_id=l.id) AS invitations,
      (SELECT count(*)::int FROM operation_logs WHERE ledger_id=l.id) AS audits,
      (SELECT count(*)::int FROM idempotency_keys k WHERE
        k.response_body #>> '{data,ledger,id}' = l.id::text OR
        k.response_body #>> '{data,ledgerId}' = l.id::text OR
        k.response_body #>> '{data,id}' IN
          (SELECT id::text FROM invitations WHERE ledger_id=l.id)) AS replays
      FROM ledgers l WHERE l.id=$1`,
    [ledgerId],
  );
  expect(result.rows).toHaveLength(1);
  return result.rows[0]!;
}

describe('independent ledger and invitation HTTP/PostgreSQL regressions (issue 18)', () => {
  it('keeps preview read-only and returns complete, consistent contracts to both accounts', async () => {
    const owner = await fixture.register('独立核对甲');
    const friend = await fixture.register('独立核对乙');
    const { ledger, invitation } = await create(owner);
    const initial = { version: 1, members: 1, invitations: 1, audits: 1, replays: 1 };
    expect(await effects(ledger.id)).toEqual(initial);
    for (let i = 0; i < 2; i++) {
      const body = success(await preview(friend, invitation.code), endpoints.previewJoin.response);
      expect(body.data).toEqual({
        ledgerId: ledger.id,
        name: ledger.name,
        creatorName: '独立核对甲',
        memberCount: 1,
        alreadyMember: false,
        canJoin: true,
      });
      expect(await effects(ledger.id)).toEqual(initial);
    }
    success(await join(friend, invitation.code), endpoints.joinLedger.response);
    const memberViews = [];
    for (const account of [owner, friend]) {
      const list = success(await get(account, '/api/v1/ledgers'), endpoints.listLedgers.response);
      expect(list).toEqual({
        data: [{ ...ledger, version: 2, memberCount: 2 }],
        page: { nextCursor: null },
      });
      const detail = success(
        await get(account, `/api/v1/ledgers/${ledger.id}`),
        endpoints.getLedger.response,
      ).data;
      const members = success(
        await get(account, `/api/v1/ledgers/${ledger.id}/members`),
        endpoints.listMembers.response,
      ).data;
      expect(detail.members).toEqual(members);
      expect(members.map((member) => [member.userId, member.role])).toEqual([
        [owner.user.id, 'CREATOR'],
        [friend.user.id, 'MEMBER'],
      ]);
      expect(detail.myMemberId).toBe(members.find((m) => m.userId === account.user.id)!.id);
      memberViews.push(members);
    }
    expect(memberViews[0]).toEqual(memberViews[1]);
    expect(await effects(ledger.id)).toEqual({
      ...initial,
      version: 2,
      members: 2,
      audits: 2,
      replays: 2,
    });
  });

  it('rejects a reused join key with another valid code without joining the other ledger', async () => {
    const owner = await fixture.register();
    const friend = await fixture.register();
    const a = await create(owner, 'Ledger A');
    const b = await create(owner, 'Ledger B');
    const key = randomUUID();
    const first = success(
      await join(friend, a.invitation.code, key),
      endpoints.joinLedger.response,
    );
    const aBefore = await effects(a.ledger.id);
    const bBefore = await effects(b.ledger.id);
    rejected(await join(friend, b.invitation.code, key), 409, 'IDEMPOTENCY_CONFLICT');
    expect(await effects(a.ledger.id)).toEqual(aBefore);
    expect(await effects(b.ledger.id)).toEqual(bBefore);
    expect(
      success(await join(friend, a.invitation.code, key), endpoints.joinLedger.response),
    ).toEqual(first);
    // A different code only succeeds when the caller explicitly starts a new submission.
    expect(
      success(await join(friend, b.invitation.code), endpoints.joinLedger.response).data,
    ).toMatchObject({
      ledgerId: b.ledger.id,
      alreadyMember: false,
    });
    expect(await effects(b.ledger.id)).toEqual({
      ...bBefore,
      version: 2,
      members: 2,
      audits: 2,
      replays: 2,
    });
  });

  it.each([true, false])(
    'serializes concurrent joins by the same user (same key=%s)',
    async (sameKey) => {
      const owner = await fixture.register();
      const friend = await fixture.register();
      const { ledger, invitation } = await create(owner);
      const key = randomUUID();
      const responses = await Promise.all(
        Array.from({ length: 4 }, () =>
          join(friend, invitation.code, sameKey ? key : randomUUID()),
        ),
      );
      const bodies = responses.map((response) => success(response, endpoints.joinLedger.response));
      expect(new Set(bodies.map((body) => body.data.memberId)).size).toBe(1);
      expect(bodies.filter((body) => !body.data.alreadyMember)).toHaveLength(sameKey ? 4 : 1);
      if (sameKey) for (const body of bodies) expect(body).toEqual(bodies[0]);
      expect(await effects(ledger.id)).toEqual({
        version: 2,
        members: 2,
        invitations: 1,
        audits: 2,
        replays: sameKey ? 2 : 5,
      });
    },
  );

  it.each([undefined, 'not-a-uuid'])(
    'rejects a missing or malformed join key (%s) without side effects',
    async (key) => {
      const owner = await fixture.register();
      const friend = await fixture.register();
      const { ledger, invitation } = await create(owner);
      const before = await effects(ledger.id);
      rejected(
        await fixture.app.inject({
          method: 'POST',
          url: '/api/v1/invitations/join',
          headers: headers(friend, key),
          payload: { code: invitation.code },
        }),
        400,
        'VALIDATION_ERROR',
      );
      expect(await effects(ledger.id)).toEqual(before);
    },
  );

  it('requires authentication on every shipped ledger and invitation endpoint', async () => {
    const owner = await fixture.register();
    const { ledger, invitation } = await create(owner);
    const before = await effects(ledger.id);
    const requests = [
      { method: 'GET' as const, url: '/api/v1/ledgers' },
      {
        method: 'POST' as const,
        url: '/api/v1/ledgers',
        payload: { name: 'Anonymous', coverKey: 'plain' },
      },
      { method: 'GET' as const, url: `/api/v1/ledgers/${ledger.id}` },
      { method: 'GET' as const, url: `/api/v1/ledgers/${ledger.id}/members` },
      { method: 'GET' as const, url: `/api/v1/ledgers/${ledger.id}/invitation` },
      { method: 'POST' as const, url: `/api/v1/ledgers/${ledger.id}/invitation/reset` },
      {
        method: 'POST' as const,
        url: '/api/v1/invitations/preview',
        payload: { code: invitation.code },
      },
      {
        method: 'POST' as const,
        url: '/api/v1/invitations/join',
        payload: { code: invitation.code },
      },
    ];
    for (const request of requests) {
      const response = await fixture.app.inject({
        ...request,
        headers: { 'idempotency-key': randomUUID() },
      });
      rejected(response, 401, 'UNAUTHENTICATED');
      expect(response.body).not.toContain(invitation.code);
      expect(response.body).not.toContain(ledger.name);
    }
    expect(await effects(ledger.id)).toEqual(before);
  });

  it('denies invitation management to members and outsiders without replacing codes or storing results', async () => {
    const owner = await fixture.register();
    const member = await fixture.register();
    const outsider = await fixture.register();
    const { ledger, invitation } = await create(owner);
    success(await join(member, invitation.code), endpoints.joinLedger.response);
    const before = await effects(ledger.id);
    for (const account of [member, outsider]) {
      const url = `/api/v1/ledgers/${ledger.id}/invitation`;
      for (const response of [
        await get(account, url),
        await fixture.app.inject({
          method: 'POST',
          url: `${url}/reset`,
          headers: headers(account, randomUUID()),
        }),
      ]) {
        rejected(response, 403, 'FORBIDDEN');
        expect(response.body).not.toContain(invitation.code);
      }
    }
    expect(await effects(ledger.id)).toEqual(before);
    expect(
      success(
        await get(owner, `/api/v1/ledgers/${ledger.id}/invitation`),
        endpoints.getInvitation.response,
      ).data,
    ).toEqual(invitation);
  });

  it('rechecks expiry after preview and does not consume the key of a rejected join', async () => {
    const owner = await fixture.register();
    const friend = await fixture.register();
    const { ledger, invitation } = await create(owner);
    success(await preview(friend, invitation.code), endpoints.previewJoin.response);
    const before = await effects(ledger.id);
    await fixture.db.orm
      .update(invitations)
      .set({
        createdAt: new Date(Date.now() - 8 * 86_400_000),
        expiresAt: new Date(Date.now() - 86_400_000),
      })
      .where(eq(invitations.id, invitation.id));
    const key = randomUUID();
    rejected(await join(friend, invitation.code, key), 409, 'INVITE_EXPIRED');
    expect(await effects(ledger.id)).toEqual(before);
    await fixture.db.orm
      .update(invitations)
      .set({ expiresAt: new Date(invitation.expiresAt) })
      .where(eq(invitations.id, invitation.id));
    expect(
      success(await join(friend, invitation.code, key), endpoints.joinLedger.response).data
        .alreadyMember,
    ).toBe(false);
    expect(await effects(ledger.id)).toEqual({
      ...before,
      version: 2,
      members: 2,
      audits: 2,
      replays: 2,
    });
  });

  it('allows exactly one of two blocked joiners to take the twelfth seat', async () => {
    const owner = await fixture.register();
    const racers = [await fixture.register(), await fixture.register()];
    const { ledger, invitation } = await create(owner);
    const seeded = await Promise.all(
      Array.from({ length: 10 }, (_, i) => fixture.seedUser(`Boundary member ${i}`)),
    );
    await fixture.db.orm
      .insert(ledgerMembers)
      .values(seeded.map((userId) => ({ ledgerId: ledger.id, userId })));
    const blocker = await fixture.db.pool.connect();
    const pending: ReturnType<typeof join>[] = [];
    try {
      await blocker.query('begin');
      const pid = await blocker.query<{ pid: number }>('select pg_backend_pid() as pid');
      await blocker.query('select id from ledgers where id=$1 for update', [ledger.id]);
      for (const account of racers)
        pending.push(join(account, invitation.code).then((response) => response));
      await waitForBlockedQueries(fixture.db.pool, pid.rows[0]!.pid, 2);
      expect(
        success(await preview(racers[0]!, invitation.code), endpoints.previewJoin.response).data,
      ).toMatchObject({ memberCount: 11, canJoin: true });
      await blocker.query('commit');
      const results = await Promise.all(pending);
      expect(results.map((response) => response.statusCode).sort()).toEqual([200, 409]);
      for (const response of results) {
        if (response.statusCode === 200) success(response, endpoints.joinLedger.response);
        else rejected(response, 409, 'MEMBER_LIMIT_REACHED');
      }
      const winner = racers[results.findIndex((response) => response.statusCode === 200)]!;
      const loser = racers[results.findIndex((response) => response.statusCode === 409)]!;
      expect(await effects(ledger.id)).toEqual({
        version: 2,
        members: 12,
        invitations: 1,
        audits: 2,
        replays: 2,
      });
      rejected(await join(loser, invitation.code), 409, 'MEMBER_LIMIT_REACHED');
      expect(
        success(await join(winner, invitation.code), endpoints.joinLedger.response).data
          .alreadyMember,
      ).toBe(true);
      expect(
        success(await preview(loser, invitation.code), endpoints.previewJoin.response).data,
      ).toMatchObject({ memberCount: 12, canJoin: false });
      expect(await effects(ledger.id)).toEqual({
        version: 2,
        members: 12,
        invitations: 1,
        audits: 2,
        replays: 3,
      });
    } finally {
      try {
        await blocker.query('rollback');
      } finally {
        blocker.release();
        await Promise.allSettled(pending);
      }
    }
  });

  it('cleans API-created accounts and ledgers while preserving another fixture in the same test database', async () => {
    const survivor = await integrationFixture();
    try {
      const owner = await fixture.register();
      const friend = await fixture.register();
      const { ledger, invitation } = await create(owner);
      success(await join(friend, invitation.code), endpoints.joinLedger.response);
      const sessionIds = (
        await fixture.db.pool.query<{ id: string }>(
          'SELECT id FROM auth_sessions WHERE user_id=ANY($1::uuid[])',
          [[owner.user.id, friend.user.id]],
        )
      ).rows.map((row) => row.id);
      expect(sessionIds).toHaveLength(2);
      const keeper = await survivor.register('Surviving fixture');
      const preserved = success(
        await survivor.app.inject({
          method: 'POST',
          url: '/api/v1/ledgers',
          headers: headers(keeper, randomUUID()),
          payload: { name: 'Preserved ledger', coverKey: 'plain' },
        }),
        endpoints.createLedger.response,
        201,
      ).data.ledger;
      closed = true;
      await fixture.close();
      const cleaned = await survivor.db.pool.query(
        `SELECT
          (SELECT count(*)::int FROM users WHERE id=ANY($1::uuid[])) AS users,
          (SELECT count(*)::int FROM auth_sessions WHERE user_id=ANY($1::uuid[])) AS sessions,
          (SELECT count(*)::int FROM auth_refresh_tokens WHERE session_id=ANY($3::uuid[])) AS refresh_tokens,
          (SELECT count(*)::int FROM ledgers WHERE id=$2) AS ledgers,
          (SELECT count(*)::int FROM ledger_members WHERE ledger_id=$2) AS members,
          (SELECT count(*)::int FROM invitations WHERE ledger_id=$2) AS invitations,
          (SELECT count(*)::int FROM operation_logs WHERE actor_user_id=ANY($1::uuid[])) AS audits,
          (SELECT count(*)::int FROM idempotency_keys WHERE user_id=ANY($1::uuid[])) AS replays`,
        [[owner.user.id, friend.user.id], ledger.id, sessionIds],
      );
      expect(cleaned.rows).toEqual([
        {
          users: 0,
          sessions: 0,
          refresh_tokens: 0,
          ledgers: 0,
          members: 0,
          invitations: 0,
          audits: 0,
          replays: 0,
        },
      ]);
      const remaining = success(
        await survivor.app.inject({
          url: `/api/v1/ledgers/${preserved.id}`,
          headers: headers(keeper),
        }),
        endpoints.getLedger.response,
      ).data;
      expect(remaining).toMatchObject({ ...preserved, creatorUserId: keeper.user.id });
    } finally {
      await survivor.close();
    }
  });
});
