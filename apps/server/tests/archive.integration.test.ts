import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { errorResponseSchema } from '@tongzhang/contracts';
import {
  expenseSplits,
  expenses,
  idempotencyKeys,
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
const errorCode = (res: { json: () => unknown }) =>
  errorResponseSchema.parse(res.json()).error.code;
const archive = (account: TestAccount, ledgerId: string, key: string = randomUUID()) =>
  fixture.app.inject({
    method: 'POST',
    url: `/api/v1/ledgers/${ledgerId}/archive`,
    headers: { ...auth(account), 'idempotency-key': key },
  });
const get = (account: TestAccount, url: string) =>
  fixture.app.inject({ method: 'GET', url, headers: auth(account) });

async function settledLedger() {
  const owner = await fixture.register('归档甲');
  const friend = await fixture.register('归档乙');
  const ledgerId = await fixture.ledger(owner, [friend]);
  const rows = await fixture.db.orm
    .select()
    .from(ledgerMembers)
    .where(eq(ledgerMembers.ledgerId, ledgerId));
  const ownerMember = rows.find((row) => row.userId === owner.user.id)!;
  const friendMember = rows.find((row) => row.userId === friend.user.id)!;
  const [expense] = await fixture.db.orm
    .insert(expenses)
    .values({
      ledgerId,
      recorderMemberId: ownerMember.id,
      payerMemberId: ownerMember.id,
      title: '结清前晚餐',
      amountCents: 3000n,
      category: 'DINING',
      occurredOn: '2026-10-26',
      splitMode: 'EQUAL',
    })
    .returning();
  await fixture.db.orm.insert(expenseSplits).values([
    { expenseId: expense!.id, ledgerId, memberId: ownerMember.id, amountCents: 1500n },
    { expenseId: expense!.id, ledgerId, memberId: friendMember.id, amountCents: 1500n },
  ]);
  const settledAt = new Date('2026-10-26T08:00:00.000Z');
  await fixture.db.orm
    .update(ledgers)
    .set({ status: 'SETTLED', settledAt, version: 4 })
    .where(eq(ledgers.id, ledgerId));
  return { owner, friend, ledgerId, ownerMember, friendMember, settledAt };
}

describe('personal archive and history', () => {
  it('archives only the caller of a settled ledger and keeps history readable', async () => {
    const { owner, friend, ledgerId, settledAt } = await settledLedger();
    const key = randomUUID();
    const first = await archive(owner, ledgerId, key);
    expect(first.statusCode).toBe(200);
    const archivedAt = first.json().data.archivedAt as string;
    expect(first.json().data.ledgerId).toBe(ledgerId);
    expect(new Date(archivedAt).getTime()).toBeGreaterThan(settledAt.getTime());

    const replay = await archive(owner, ledgerId, key);
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toEqual(first.json());
    const again = await archive(owner, ledgerId);
    expect(again.json().data.archivedAt).toBe(archivedAt);

    const [ledger] = await fixture.db.orm.select().from(ledgers).where(eq(ledgers.id, ledgerId));
    expect(ledger).toMatchObject({ status: 'SETTLED', version: 4, settledAt });
    expect(
      await fixture.db.orm.select().from(expenses).where(eq(expenses.ledgerId, ledgerId)),
    ).toHaveLength(1);
    const members = await fixture.db.orm
      .select()
      .from(ledgerMembers)
      .where(eq(ledgerMembers.ledgerId, ledgerId));
    expect(members.find((row) => row.userId === owner.user.id)!.archivedAt?.toISOString()).toBe(
      archivedAt,
    );
    expect(members.find((row) => row.userId === friend.user.id)!.archivedAt).toBeNull();
    expect(
      await fixture.db.orm.select().from(operationLogs).where(eq(operationLogs.ledgerId, ledgerId)),
    ).toHaveLength(1);

    expect((await get(owner, '/api/v1/ledgers')).json().data).toEqual([]);
    const history = (await get(owner, '/api/v1/ledgers?archived=true')).json().data;
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      id: ledgerId,
      status: 'SETTLED',
      version: 4,
      archivedAt,
      expenseTotalCents: '3000',
    });
    const detail = (await get(owner, `/api/v1/ledgers/${ledgerId}`)).json().data;
    expect(detail).toMatchObject({
      status: 'SETTLED',
      version: 4,
      archivedAt,
      expenseTotalCents: '3000',
      myNetCents: '1500',
    });
    expect((await get(friend, '/api/v1/ledgers')).json().data[0]).toMatchObject({
      id: ledgerId,
      archivedAt: null,
      expenseTotalCents: '3000',
    });
    expect((await get(friend, '/api/v1/ledgers?archived=true')).json().data).toEqual([]);
  });

  it('lets the other member archive independently without moving the first timestamp', async () => {
    const { owner, friend, ledgerId } = await settledLedger();
    const ownerAt = (await archive(owner, ledgerId)).json().data.archivedAt;
    const friendAt = (await archive(friend, ledgerId)).json().data.archivedAt;
    expect(friendAt).toEqual(expect.any(String));
    const members = await fixture.db.orm
      .select()
      .from(ledgerMembers)
      .where(eq(ledgerMembers.ledgerId, ledgerId));
    expect(members.find((row) => row.userId === owner.user.id)!.archivedAt?.toISOString()).toBe(
      ownerAt,
    );
    expect(members.find((row) => row.userId === friend.user.id)!.archivedAt?.toISOString()).toBe(
      friendAt,
    );
    expect((await get(friend, '/api/v1/ledgers?archived=true')).json().data[0].id).toBe(ledgerId);
    expect((await get(friend, '/api/v1/ledgers')).json().data).toEqual([]);
  });

  it('rejects active and settling ledgers without an archive time or idempotency result', async () => {
    const owner = await fixture.register('未结清');
    const outsider = await fixture.register('旁观者');
    const ledgerId = await fixture.ledger(owner);
    for (const status of ['ACTIVE', 'SETTLING'] as const) {
      await fixture.db.orm
        .update(ledgers)
        .set({ status, settledAt: null })
        .where(eq(ledgers.id, ledgerId));
      const key = randomUUID();
      const denied = await archive(owner, ledgerId, key);
      expect(denied.statusCode).toBe(409);
      expect(errorCode(denied)).toBe('LEDGER_STATE_INVALID');
      expect(
        await fixture.db.orm
          .select()
          .from(idempotencyKeys)
          .where(eq(idempotencyKeys.userId, owner.user.id)),
      ).toHaveLength(0);
    }
    const [member] = await fixture.db.orm
      .select()
      .from(ledgerMembers)
      .where(eq(ledgerMembers.ledgerId, ledgerId));
    expect(member!.archivedAt).toBeNull();
    expect((await get(owner, '/api/v1/ledgers')).json().data).toHaveLength(1);

    const hidden = await archive(outsider, ledgerId);
    expect(hidden.statusCode).toBe(403);
    expect(errorCode(hidden)).toBe('FORBIDDEN');
    expect(hidden.body).not.toContain('隔离测试账本');
    const anonymous = await fixture.app.inject({
      method: 'POST',
      url: `/api/v1/ledgers/${ledgerId}/archive`,
      headers: { 'idempotency-key': randomUUID() },
    });
    expect(anonymous.statusCode).toBe(401);
    const keyless = await fixture.app.inject({
      method: 'POST',
      url: `/api/v1/ledgers/${ledgerId}/archive`,
      headers: auth(owner),
    });
    expect(keyless.statusCode).toBe(400);
    expect(errorCode(keyless)).toBe('VALIDATION_ERROR');
  });
});
