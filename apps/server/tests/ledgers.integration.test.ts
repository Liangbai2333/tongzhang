import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import {
  errorResponseSchema,
  ledgerDetailSchema,
  ledgerSummarySchema,
  memberSchema,
  invitationSchema,
  joinPreviewSchema,
  joinResultSchema,
} from '@tongzhang/contracts';
import {
  expenseSplits,
  expenses,
  idempotencyKeys,
  invitations,
  ledgerMembers,
  ledgers,
  operationLogs,
} from '../src/db/schema/index.js';
import { integrationFixture, type TestAccount } from './fixtures/integration.js';

let fixture: Awaited<ReturnType<typeof integrationFixture>>;
beforeEach(async () => {
  fixture = await integrationFixture();
});
afterEach(async () => {
  await fixture.close();
});

const auth = (account: TestAccount) => ({ authorization: `Bearer ${account.accessToken}` });
const createLedger = (
  account: TestAccount,
  body: object = { name: '鼓山一日', coverKey: 'mountain' },
  key: string = randomUUID(),
) =>
  fixture.app.inject({
    method: 'POST',
    url: '/api/v1/ledgers',
    headers: { ...auth(account), 'idempotency-key': key },
    payload: body,
  });
const get = (account: TestAccount, url: string) =>
  fixture.app.inject({ method: 'GET', url, headers: auth(account) });
const post = (account: TestAccount, url: string, payload?: object, key: string = randomUUID()) =>
  fixture.app.inject({
    method: 'POST',
    url,
    headers: { ...auth(account), 'idempotency-key': key },
    payload,
  });
const join = (account: TestAccount, code: string, key?: string) =>
  post(account, '/api/v1/invitations/join', { code }, key);
const preview = (account: TestAccount, code: string) =>
  post(account, '/api/v1/invitations/preview', { code });
const errorCode = (res: { json: () => unknown }) =>
  errorResponseSchema.parse(res.json()).error.code;

async function created(account: TestAccount) {
  const res = await createLedger(account);
  expect(res.statusCode).toBe(201);
  const data = res.json().data;
  return {
    ledger: ledgerSummarySchema.parse(data.ledger),
    invitation: invitationSchema.parse(data.invitation),
  };
}
const memberRows = (ledgerId: string) =>
  fixture.db.orm.select().from(ledgerMembers).where(eq(ledgerMembers.ledgerId, ledgerId));

describe('createLedger / list / detail / members', () => {
  it('makes the creator a member, issues an invitation and reads the same data everywhere', async () => {
    const owner = await fixture.register('甲方');
    const { ledger, invitation } = await created(owner);

    expect(ledger).toMatchObject({
      name: '鼓山一日',
      coverKey: 'mountain',
      status: 'ACTIVE',
      version: 1,
      memberCount: 1,
      expenseTotalCents: '0',
      archivedAt: null,
    });
    expect(invitation.qrPayload).toBe(`tongzhang:invite:v1:${invitation.code}`);
    expect(invitation.expired).toBe(false);
    expect(new Date(invitation.expiresAt).getTime()).toBeGreaterThan(Date.now() + 6 * 86_400_000);

    const list = await get(owner, '/api/v1/ledgers');
    expect(list.statusCode).toBe(200);
    expect(list.json().data).toEqual([ledger]);
    expect(list.json().page.nextCursor).toBeNull();

    const detail = ledgerDetailSchema.parse(
      (await get(owner, `/api/v1/ledgers/${ledger.id}`)).json().data,
    );
    const members = (await get(owner, `/api/v1/ledgers/${ledger.id}/members`)).json().data;
    memberSchema.array().parse(members);
    expect(detail).toMatchObject({ ...ledger, creatorUserId: owner.user.id });
    expect(detail.members).toEqual(members);
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({
      userId: owner.user.id,
      username: '甲方',
      role: 'CREATOR',
      netCents: '0',
    });
    expect(detail.myMemberId).toBe(members[0].id);

    const rows = await memberRows(ledger.id);
    expect(rows.map((r) => r.userId)).toEqual([owner.user.id]);
    expect(
      await fixture.db.orm.select().from(invitations).where(eq(invitations.ledgerId, ledger.id)),
    ).toHaveLength(1);
    expect(
      await fixture.db.orm
        .select()
        .from(operationLogs)
        .where(eq(operationLogs.ledgerId, ledger.id)),
    ).toHaveLength(1);
  });

  it('does not create a second ledger for the same idempotency key and rejects a changed body', async () => {
    const owner = await fixture.register();
    const key = randomUUID();
    const first = await createLedger(owner, { name: '重复提交', coverKey: 'city' }, key);
    const replay = await createLedger(owner, { name: '重复提交', coverKey: 'city' }, key);
    expect(first.statusCode).toBe(201);
    expect(replay.statusCode).toBe(201);
    expect(replay.json()).toEqual(first.json());

    const conflict = await createLedger(owner, { name: '另一个名字', coverKey: 'city' }, key);
    expect(conflict.statusCode).toBe(409);
    expect(errorCode(conflict)).toBe('IDEMPOTENCY_CONFLICT');

    const rows = await fixture.db.orm
      .select()
      .from(ledgers)
      .where(eq(ledgers.createdByUserId, owner.user.id));
    expect(rows).toHaveLength(1);
    expect(
      await fixture.db.orm
        .select()
        .from(idempotencyKeys)
        .where(eq(idempotencyKeys.userId, owner.user.id)),
    ).toHaveLength(1);
  });

  it('serialises concurrent requests that share one idempotency key', async () => {
    const owner = await fixture.register();
    const key = randomUUID();
    const responses = await Promise.all(
      Array.from({ length: 4 }, () =>
        createLedger(owner, { name: '并发创建', coverKey: 'plain' }, key),
      ),
    );
    expect(responses.map((r) => r.statusCode)).toEqual([201, 201, 201, 201]);
    expect(new Set(responses.map((r) => r.json().data.ledger.id)).size).toBe(1);
    expect(
      await fixture.db.orm.select().from(ledgers).where(eq(ledgers.createdByUserId, owner.user.id)),
    ).toHaveLength(1);
  });

  it('rejects anonymous, keyless and unsupported-cover creation without leaving rows', async () => {
    const owner = await fixture.register();
    const anonymous = await fixture.app.inject({
      method: 'POST',
      url: '/api/v1/ledgers',
      headers: { 'idempotency-key': randomUUID() },
      payload: { name: 'x', coverKey: 'city' },
    });
    expect(anonymous.statusCode).toBe(401);
    expect(errorCode(anonymous)).toBe('UNAUTHENTICATED');

    const keyless = await fixture.app.inject({
      method: 'POST',
      url: '/api/v1/ledgers',
      headers: auth(owner),
      payload: { name: '无键', coverKey: 'city' },
    });
    expect(keyless.statusCode).toBe(400);

    const invalid = await createLedger(owner, { name: '   ', coverKey: 'city' });
    expect(invalid.statusCode).toBe(400);
    const both = await createLedger(owner, {
      name: '双封面',
      coverKey: 'city',
      coverImageId: randomUUID(),
    });
    expect(both.statusCode).toBe(400);
    const custom = await createLedger(owner, { name: '自定义封面', coverImageId: randomUUID() });
    expect(custom.statusCode).toBe(501);
    expect(errorCode(custom)).toBe('FEATURE_NOT_READY');

    expect(
      await fixture.db.orm.select().from(ledgers).where(eq(ledgers.createdByUserId, owner.user.id)),
    ).toHaveLength(0);
    expect(
      await fixture.db.orm
        .select()
        .from(idempotencyKeys)
        .where(eq(idempotencyKeys.userId, owner.user.id)),
    ).toHaveLength(0);
  });

  it('refuses anonymous and non-member reads without leaking ledger data', async () => {
    const owner = await fixture.register();
    const outsider = await fixture.register();
    const { ledger } = await created(owner);
    for (const suffix of ['', '/members']) {
      const anonymous = await fixture.app.inject(`/api/v1/ledgers/${ledger.id}${suffix}`);
      expect(anonymous.statusCode).toBe(401);
      expect(errorCode(anonymous)).toBe('UNAUTHENTICATED');
      for (const id of [ledger.id, randomUUID()]) {
        const denied = await get(outsider, `/api/v1/ledgers/${id}${suffix}`);
        expect(denied.statusCode).toBe(403);
        expect(errorCode(denied)).toBe('FORBIDDEN');
        expect(denied.body).not.toContain('鼓山一日');
      }
    }
    const anonymousList = await fixture.app.inject('/api/v1/ledgers');
    expect(anonymousList.statusCode).toBe(401);
    expect((await get(outsider, '/api/v1/ledgers')).json().data).toEqual([]);
  });

  it('pages the list with a stable cursor and only shows own ledgers', async () => {
    const owner = await fixture.register();
    const other = await fixture.register();
    const ids: string[] = [];
    for (const name of ['一', '二', '三']) {
      const res = await createLedger(owner, { name, coverKey: 'dining' });
      ids.push(res.json().data.ledger.id);
    }
    await createLedger(other, { name: '别人的', coverKey: 'city' });

    const first = (await get(owner, '/api/v1/ledgers?limit=2')).json();
    expect(first.data.map((l: { id: string }) => l.id)).toEqual([ids[2], ids[1]]);
    expect(first.page.nextCursor).toEqual(expect.any(String));
    const second = (
      await get(owner, `/api/v1/ledgers?limit=2&cursor=${first.page.nextCursor}`)
    ).json();
    expect(second.data.map((l: { id: string }) => l.id)).toEqual([ids[0]]);
    expect(second.page.nextCursor).toBeNull();

    const bad = await get(owner, '/api/v1/ledgers?cursor=not-a-cursor');
    expect(bad.statusCode).toBe(400);
    expect((await get(owner, '/api/v1/ledgers?archived=true')).json().data).toEqual([]);
  });

  it('derives paid, shared and net figures from real expense rows', async () => {
    const owner = await fixture.register('甲方');
    const friend = await fixture.register('乙方');
    const { ledger, invitation } = await created(owner);
    expect((await join(friend, invitation.code)).statusCode).toBe(200);
    const rows = await memberRows(ledger.id);
    const ownerMember = rows.find((r) => r.userId === owner.user.id)!.id;
    const friendMember = rows.find((r) => r.userId === friend.user.id)!.id;
    const [expense] = await fixture.db.orm
      .insert(expenses)
      .values({
        ledgerId: ledger.id,
        recorderMemberId: ownerMember,
        payerMemberId: ownerMember,
        title: '晚餐',
        amountCents: 12000n,
        category: 'DINING',
        occurredOn: '2026-10-25',
        splitMode: 'EQUAL',
      })
      .returning();
    await fixture.db.orm.insert(expenseSplits).values([
      { expenseId: expense!.id, ledgerId: ledger.id, memberId: ownerMember, amountCents: 6000n },
      { expenseId: expense!.id, ledgerId: ledger.id, memberId: friendMember, amountCents: 6000n },
    ]);

    const ownerView = ledgerDetailSchema.parse(
      (await get(owner, `/api/v1/ledgers/${ledger.id}`)).json().data,
    );
    const friendView = ledgerDetailSchema.parse(
      (await get(friend, `/api/v1/ledgers/${ledger.id}`)).json().data,
    );
    expect(ownerView).toMatchObject({
      expenseTotalCents: '12000',
      myPaidCents: '12000',
      mySharedCents: '6000',
      myNetCents: '6000',
      myRemainingNetCents: '6000',
    });
    expect(friendView).toMatchObject({
      expenseTotalCents: '12000',
      myPaidCents: '0',
      mySharedCents: '6000',
      myNetCents: '-6000',
    });
    expect(ownerView.members.map((m) => m.netCents)).toEqual(['6000', '-6000']);
    expect(ownerView.members).toEqual(friendView.members);
    const listed = (await get(friend, '/api/v1/ledgers')).json().data[0];
    expect(listed).toMatchObject({ expenseTotalCents: '12000', myRemainingNetCents: '-6000' });
  });
});

describe('invitations: preview, join and reset', () => {
  it('lets a second user preview and join with a valid code, once', async () => {
    const owner = await fixture.register('甲方');
    const friend = await fixture.register('乙方');
    const { ledger, invitation } = await created(owner);

    const previewed = joinPreviewSchema.parse((await preview(friend, invitation.code)).json().data);
    expect(previewed).toEqual({
      ledgerId: ledger.id,
      name: '鼓山一日',
      creatorName: '甲方',
      memberCount: 1,
      alreadyMember: false,
      canJoin: true,
    });
    expect(Object.keys(previewed)).not.toContain('expenseTotalCents');

    const key = randomUUID();
    const joined = await join(friend, invitation.code, key);
    expect(joined.statusCode).toBe(200);
    const result = joinResultSchema.parse(joined.json().data);
    expect(result).toMatchObject({ ledgerId: ledger.id, alreadyMember: false });

    // Replaying the same key, and joining again with a fresh key, both write nothing.
    expect((await join(friend, invitation.code, key)).json()).toEqual(joined.json());
    const again = joinResultSchema.parse((await join(friend, invitation.code)).json().data);
    expect(again).toEqual({ ...result, alreadyMember: true });
    const rows = await memberRows(ledger.id);
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.userId === friend.user.id)).toHaveLength(1);

    const [row] = await fixture.db.orm.select().from(ledgers).where(eq(ledgers.id, ledger.id));
    expect(row!.version).toBe(2);
    expect(
      await fixture.db.orm
        .select()
        .from(operationLogs)
        .where(
          and(eq(operationLogs.ledgerId, ledger.id), eq(operationLogs.action, 'MEMBER_JOINED')),
        ),
    ).toHaveLength(1);

    // Everyone reads the same members and the joiner now sees the ledger.
    const asOwner = (await get(owner, `/api/v1/ledgers/${ledger.id}/members`)).json().data;
    const asFriend = (await get(friend, `/api/v1/ledgers/${ledger.id}/members`)).json().data;
    expect(asOwner).toEqual(asFriend);
    expect(asOwner.map((m: { role: string }) => m.role)).toEqual(['CREATOR', 'MEMBER']);
    expect((await get(friend, '/api/v1/ledgers')).json().data[0]).toMatchObject({
      id: ledger.id,
      memberCount: 2,
      version: 2,
    });
    expect((await preview(friend, invitation.code)).json().data).toMatchObject({
      alreadyMember: true,
      canJoin: false,
      memberCount: 2,
    });
  });

  it('rejects malformed, unknown, expired and replaced codes', async () => {
    const owner = await fixture.register();
    const friend = await fixture.register();
    const { ledger, invitation } = await created(owner);

    const malformed = await preview(friend, 'abc');
    expect(malformed.statusCode).toBe(400);
    expect(errorCode(malformed)).toBe('VALIDATION_ERROR');
    expect((await join(friend, '0OIl1!')).statusCode).toBe(400);

    const unknown = invitation.code === 'ZZZZZZ' ? 'YYYYYY' : 'ZZZZZZ';
    for (const call of [preview, join]) {
      const res = await call(friend, unknown);
      expect(res.statusCode).toBe(400);
      expect(errorCode(res)).toBe('INVITE_INVALID');
    }

    await fixture.db.orm
      .update(invitations)
      .set({
        createdAt: new Date(Date.now() - 8 * 86_400_000),
        expiresAt: new Date(Date.now() - 86_400_000),
      })
      .where(eq(invitations.ledgerId, ledger.id));
    for (const call of [preview, join]) {
      const res = await call(friend, invitation.code);
      expect(res.statusCode).toBe(409);
      expect(errorCode(res)).toBe('INVITE_EXPIRED');
    }
    expect((await get(owner, `/api/v1/ledgers/${ledger.id}/invitation`)).json().data).toMatchObject(
      {
        expired: true,
      },
    );
    expect(await memberRows(ledger.id)).toHaveLength(1);

    // Only the creator can replace it; the old code is then invalid, the new one works.
    const denied = await post(friend, `/api/v1/ledgers/${ledger.id}/invitation/reset`);
    expect(denied.statusCode).toBe(403);
    const reset = await post(owner, `/api/v1/ledgers/${ledger.id}/invitation/reset`);
    expect(reset.statusCode).toBe(200);
    const fresh = invitationSchema.parse(reset.json().data);
    expect(fresh.code).not.toBe(invitation.code);
    expect(fresh.expired).toBe(false);
    expect(errorCode(await preview(friend, invitation.code))).toBe('INVITE_INVALID');
    expect((await join(friend, fresh.code)).statusCode).toBe(200);
  });

  it('protects the invitation endpoints with authentication and creator-only access', async () => {
    const owner = await fixture.register();
    const member = await fixture.register();
    const outsider = await fixture.register();
    const { ledger, invitation } = await created(owner);
    await join(member, invitation.code);

    const anonymousPreview = await fixture.app.inject({
      method: 'POST',
      url: '/api/v1/invitations/preview',
      payload: { code: invitation.code },
    });
    expect(anonymousPreview.statusCode).toBe(401);
    const anonymousJoin = await fixture.app.inject({
      method: 'POST',
      url: '/api/v1/invitations/join',
      headers: { 'idempotency-key': randomUUID() },
      payload: { code: invitation.code },
    });
    expect(anonymousJoin.statusCode).toBe(401);

    const url = `/api/v1/ledgers/${ledger.id}/invitation`;
    expect((await get(owner, url)).json().data.code).toBe(invitation.code);
    for (const account of [member, outsider]) {
      const denied = await get(account, url);
      expect(denied.statusCode).toBe(403);
      expect(denied.body).not.toContain(invitation.code);
    }
  });

  it('never exceeds 12 members, including concurrent joins for the last seats', async () => {
    const owner = await fixture.register('甲方');
    const { ledger, invitation } = await created(owner);
    // Registration is rate limited, so the first nine members are seeded directly.
    const seeded = await Promise.all(
      Array.from({ length: 9 }, (_, i) => fixture.seedUser(`成员${i}`)),
    );
    await fixture.db.orm
      .insert(ledgerMembers)
      .values(seeded.map((userId) => ({ ledgerId: ledger.id, userId })));
    expect(await memberRows(ledger.id)).toHaveLength(10);

    const racers = await Promise.all(Array.from({ length: 4 }, () => fixture.register('抢位')));
    const results = await Promise.all(racers.map((u) => join(u, invitation.code)));
    expect(results.filter((r) => r.statusCode === 200)).toHaveLength(2);
    const rejected = results.filter((r) => r.statusCode !== 200);
    expect(rejected).toHaveLength(2);
    for (const res of rejected) {
      expect(res.statusCode).toBe(409);
      expect(errorCode(res)).toBe('MEMBER_LIMIT_REACHED');
    }
    expect(await memberRows(ledger.id)).toHaveLength(12);

    // A rejected join leaves neither a member nor a stored idempotent result.
    const late = await fixture.register('迟到');
    const lateKey = randomUUID();
    const refused = await join(late, invitation.code, lateKey);
    expect(errorCode(refused)).toBe('MEMBER_LIMIT_REACHED');
    expect(await memberRows(ledger.id)).toHaveLength(12);
    expect(
      await fixture.db.orm
        .select()
        .from(idempotencyKeys)
        .where(eq(idempotencyKeys.userId, late.user.id)),
    ).toHaveLength(0);
    expect((await preview(late, invitation.code)).json().data).toMatchObject({
      memberCount: 12,
      canJoin: false,
    });
    const [row] = await fixture.db.orm.select().from(ledgers).where(eq(ledgers.id, ledger.id));
    // Only the two real joins bumped the version (the nine seeded members bypass the service).
    expect(row!.version).toBe(3);
  });

  it('keeps personal archive as an explicit, member-checked 501 for the next task', async () => {
    const owner = await fixture.register();
    const outsider = await fixture.register();
    const { ledger } = await created(owner);
    const url = `/api/v1/ledgers/${ledger.id}/archive`;
    const own = await post(owner, url);
    expect(own.statusCode).toBe(501);
    expect(errorCode(own)).toBe('FEATURE_NOT_READY');
    expect((await post(outsider, url)).statusCode).toBe(403);
  });
});
