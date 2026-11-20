import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { endpoints } from '@tongzhang/contracts';
import {
  expenseSplits,
  expenses,
  ledgerMembers,
  ledgers,
  notifications,
  operationLogs,
  settlementBatches,
  settlementTransfers,
} from '../src/db/schema/index.js';
import { DEFAULT_REMINDER_COOLDOWN_MS } from '../src/modules/settlements/remind.js';
import { integrationFixture, type TestAccount } from './fixtures/integration.js';

let fixture: Awaited<ReturnType<typeof integrationFixture>>;
beforeEach(async () => {
  fixture = await integrationFixture();
});
afterEach(async () => {
  await fixture.close();
});

const authHeaders = (token: string, key: string = randomUUID()) => ({
  authorization: `Bearer ${token}`,
  'idempotency-key': key,
});

const remind = (
  ledgerId: string,
  transferId: string,
  token?: string,
  payload: object = {},
  key: string | null = randomUUID(),
) =>
  fixture.app.inject({
    method: 'POST',
    url: `/api/v1/ledgers/${ledgerId}/settlement/transfers/${transferId}/remind`,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(key === null ? {} : { 'idempotency-key': key }),
    },
    payload,
  });

async function seedGushanSettling() {
  const [an, bai, chen, ding, outsider] = await Promise.all(
    ['小安', '小白', '小陈', '小丁', '外人'].map((name) => fixture.register(name)),
  );
  const ledgerId = await fixture.ledger(an!, [bai!, chen!, ding!]);
  const members = await fixture.db.orm
    .select()
    .from(ledgerMembers)
    .where(eq(ledgerMembers.ledgerId, ledgerId));
  const memberIdOf = (acc: TestAccount) => members.find((m) => m.userId === acc.user.id)!.id;
  const ids = [memberIdOf(an!), memberIdOf(bai!), memberIdOf(chen!), memberIdOf(ding!)];

  for (const [payer, amount, participants] of [
    [ids[0]!, '12000', ids],
    [ids[1]!, '12000', ids],
    [ids[2]!, '6000', [ids[0]!, ids[2]!]],
  ] as const) {
    const res = await fixture.app.inject({
      method: 'POST',
      url: `/api/v1/ledgers/${ledgerId}/expenses`,
      headers: authHeaders(an!.accessToken),
      payload: {
        title: '鼓山消费',
        amountCents: amount,
        category: 'DINING',
        occurredOn: '2026-11-18',
        payerMemberId: payer,
        splitMode: 'EQUAL',
        splits: participants.map((memberId) => ({ memberId })),
      },
    });
    expect(res.statusCode).toBe(201);
  }

  const startRes = await fixture.app.inject({
    method: 'POST',
    url: `/api/v1/ledgers/${ledgerId}/settlement`,
    headers: authHeaders(an!.accessToken),
    payload: { expectedVersion: 4 },
  });
  expect(startRes.statusCode).toBe(201);
  const batch = endpoints.startSettlement.response.parse(startRes.json()).data.batch;
  const chenToAn = batch.transfers.find(
    (t) => t.payerMemberId === ids[2] && t.payeeMemberId === ids[0],
  )!;
  const dingToBai = batch.transfers.find(
    (t) => t.payerMemberId === ids[3] && t.payeeMemberId === ids[1],
  )!;
  expect(chenToAn.amountCents).toBe('3000');
  expect(dingToBai.amountCents).toBe('6000');

  return {
    an: an!,
    bai: bai!,
    chen: chen!,
    ding: ding!,
    outsider: outsider!,
    ledgerId,
    chenToAn,
    dingToBai,
  };
}

async function financialSnapshot(ledgerId: string, token: string) {
  const db = fixture.db.orm;
  const [ledger] = await db.select().from(ledgers).where(eq(ledgers.id, ledgerId));
  const batches = await db
    .select()
    .from(settlementBatches)
    .where(eq(settlementBatches.ledgerId, ledgerId));
  const transfers = await db
    .select()
    .from(settlementTransfers)
    .where(eq(settlementTransfers.ledgerId, ledgerId));
  const expRows = await db.select().from(expenses).where(eq(expenses.ledgerId, ledgerId));
  const splitRows = await db
    .select()
    .from(expenseSplits)
    .where(eq(expenseSplits.ledgerId, ledgerId));
  const [statsRes, balancesRes, settlementRes] = await Promise.all([
    fixture.app.inject({
      url: `/api/v1/ledgers/${ledgerId}/statistics`,
      headers: { authorization: `Bearer ${token}` },
    }),
    fixture.app.inject({
      url: `/api/v1/ledgers/${ledgerId}/balances`,
      headers: { authorization: `Bearer ${token}` },
    }),
    fixture.app.inject({
      url: `/api/v1/ledgers/${ledgerId}/settlement`,
      headers: { authorization: `Bearer ${token}` },
    }),
  ]);
  expect(statsRes.statusCode).toBe(200);
  expect(balancesRes.statusCode).toBe(200);
  expect(settlementRes.statusCode).toBe(200);
  return {
    ledger: {
      status: ledger!.status,
      version: ledger!.version,
      updatedAt: ledger!.updatedAt.toISOString(),
    },
    batches,
    transfers,
    expenses: expRows,
    splits: splitRows,
    balances: balancesRes.json().data,
    settlement: settlementRes.json().data,
    statistics: statsRes.json().data,
  };
}

describe('A32 remindTransfer integration', () => {
  it('enforces auth, idempotency header, membership, role, and self-reminder boundaries', async () => {
    const s = await seedGushanSettling();

    // Anonymous -> 401
    const anon = await remind(s.ledgerId, s.dingToBai.id);
    expect(anon.statusCode).toBe(401);

    // Missing idempotency key -> 400
    const noKey = await remind(s.ledgerId, s.dingToBai.id, s.bai.accessToken, {}, null);
    expect(noKey.statusCode).toBe(400);
    expect(noKey.json().error.code).toBe('VALIDATION_ERROR');

    // Outsider -> 403
    const outsider = await remind(s.ledgerId, s.dingToBai.id, s.outsider.accessToken);
    expect(outsider.statusCode).toBe(403);
    expect(outsider.json().error.code).toBe('FORBIDDEN');

    // Non-existent transfer -> 404
    const missing = await remind(s.ledgerId, randomUUID(), s.bai.accessToken);
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe('TRANSFER_NOT_FOUND');

    // Payer (小丁) cannot remind self -> 403
    const payerSelf = await remind(s.ledgerId, s.dingToBai.id, s.ding.accessToken);
    expect(payerSelf.statusCode).toBe(403);
    expect(payerSelf.json().error.code).toBe('FORBIDDEN');

    // Unrelated 3rd member (小陈 on 小丁->小白) -> 403
    const thirdMember = await remind(s.ledgerId, s.dingToBai.id, s.chen.accessToken);
    expect(thirdMember.statusCode).toBe(403);
    expect(thirdMember.json().error.code).toBe('FORBIDDEN');

    // Creator who IS the payer of a transfer still cannot remind self -> 403
    const creatorOwesLedgerId = await fixture.ledger(s.an, [s.bai]);
    const members = await fixture.db.orm
      .select()
      .from(ledgerMembers)
      .where(eq(ledgerMembers.ledgerId, creatorOwesLedgerId));
    const anMember = members.find((m) => m.userId === s.an.user.id)!.id;
    const baiMember = members.find((m) => m.userId === s.bai.user.id)!.id;
    const expRes = await fixture.app.inject({
      method: 'POST',
      url: `/api/v1/ledgers/${creatorOwesLedgerId}/expenses`,
      headers: authHeaders(s.bai.accessToken),
      payload: {
        title: '小白垫付',
        amountCents: '4000',
        category: 'DINING',
        occurredOn: '2026-11-18',
        payerMemberId: baiMember,
        splitMode: 'EQUAL',
        splits: [{ memberId: anMember }, { memberId: baiMember }],
      },
    });
    expect(expRes.statusCode).toBe(201);
    const freezeRes = await fixture.app.inject({
      method: 'POST',
      url: `/api/v1/ledgers/${creatorOwesLedgerId}/settlement`,
      headers: authHeaders(s.an.accessToken),
      payload: { expectedVersion: 2 },
    });
    expect(freezeRes.statusCode).toBe(201);
    const anOwesBai = endpoints.startSettlement.response.parse(freezeRes.json()).data.batch
      .transfers[0]!;
    expect(anOwesBai.payerMemberId).toBe(anMember);

    const creatorPayer = await remind(creatorOwesLedgerId, anOwesBai.id, s.an.accessToken);
    expect(creatorPayer.statusCode).toBe(403);
    expect(creatorPayer.json().error.code).toBe('FORBIDDEN');
  });

  it('delivers reminder, enforces cooldown & idempotency, and leaves financial state untouched', async () => {
    const s = await seedGushanSettling();
    const before = await financialSnapshot(s.ledgerId, s.an.accessToken);

    const key1 = randomUUID();
    const first = await remind(
      s.ledgerId,
      s.dingToBai.id,
      s.bai.accessToken,
      { note: '方便时转一下门票钱' },
      key1,
    );
    expect(first.statusCode).toBe(200);
    const firstData = endpoints.remindTransfer.response.parse(first.json()).data;
    expect(Object.keys(first.json().data).sort()).toEqual([
      'cooldownEndsAt',
      'ledgerId',
      'remindedAt',
      'transferId',
    ]);
    expect(Date.parse(firstData.cooldownEndsAt) - Date.parse(firstData.remindedAt)).toBe(
      DEFAULT_REMINDER_COOLDOWN_MS,
    );

    // Payer (小丁) receives the in-app notification via A33
    const dingList = await fixture.app.inject({
      url: '/api/v1/me/notifications?unreadOnly=true',
      headers: { authorization: `Bearer ${s.ding.accessToken}` },
    });
    expect(dingList.statusCode).toBe(200);
    const items = endpoints.listNotifications.response.parse(dingList.json()).data;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      type: 'SETTLEMENT_REMINDER',
      ledgerId: s.ledgerId,
      transferId: s.dingToBai.id,
      actorUserId: s.bai.user.id,
      amountCents: '6000',
      note: '方便时转一下门票钱',
      readAt: null,
    });

    // Idempotent replay with same key & body returns identical timestamps even inside cooldown
    const replay = await remind(
      s.ledgerId,
      s.dingToBai.id,
      s.bai.accessToken,
      { note: '方便时转一下门票钱' },
      key1,
    );
    expect(replay.statusCode).toBe(200);
    expect(replay.json().data).toEqual(firstData);

    // Same key with different body -> 409 IDEMPOTENCY_CONFLICT
    const conflict = await remind(
      s.ledgerId,
      s.dingToBai.id,
      s.bai.accessToken,
      { note: '换一条备注' },
      key1,
    );
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().error.code).toBe('IDEMPOTENCY_CONFLICT');

    // New key inside cooldown (from either payee OR creator) -> 429 REMINDER_COOLDOWN
    const repeatByPayee = await remind(s.ledgerId, s.dingToBai.id, s.bai.accessToken);
    expect(repeatByPayee.statusCode).toBe(429);
    expect(repeatByPayee.json().error.code).toBe('REMINDER_COOLDOWN');

    const repeatByCreator = await remind(s.ledgerId, s.dingToBai.id, s.an.accessToken);
    expect(repeatByCreator.statusCode).toBe(429);
    expect(repeatByCreator.json().error.code).toBe('REMINDER_COOLDOWN');

    // Another transfer in the same ledger is independent of dingToBai's cooldown
    const otherTransfer = await remind(s.ledgerId, s.chenToAn.id, s.an.accessToken, {});
    expect(otherTransfer.statusCode).toBe(200);

    // Financial state & ledger version must have zero mutations
    const after = await financialSnapshot(s.ledgerId, s.an.accessToken);
    expect(after).toEqual(before);

    // After cooldown expires, creator (non-payer) can remind dingToBai again
    const expiredAt = new Date(Date.now() - DEFAULT_REMINDER_COOLDOWN_MS - 1000);
    await fixture.db.orm
      .update(operationLogs)
      .set({ createdAt: expiredAt })
      .where(
        and(
          eq(operationLogs.ledgerId, s.ledgerId),
          eq(operationLogs.action, 'TRANSFER_REMINDED'),
          eq(operationLogs.targetId, s.dingToBai.id),
        ),
      );
    const afterExpiry = await remind(s.ledgerId, s.dingToBai.id, s.an.accessToken, {
      note: '创建者协助提醒',
    });
    expect(afterExpiry.statusCode).toBe(200);

    const dingRows = await fixture.db.orm
      .select()
      .from(notifications)
      .where(eq(notifications.recipientUserId, s.ding.user.id));
    expect(dingRows).toHaveLength(2);
  });

  it('stays silent without leaking notification_enabled=false and still enforces cooldown', async () => {
    const s = await seedGushanSettling();

    // Payer (小丁) disables notifications via A29
    const prefRes = await fixture.app.inject({
      method: 'PATCH',
      url: '/api/v1/me/preferences',
      headers: { authorization: `Bearer ${s.ding.accessToken}` },
      payload: { notificationEnabled: false },
    });
    expect(prefRes.statusCode).toBe(200);

    const res = await remind(s.ledgerId, s.dingToBai.id, s.bai.accessToken, { note: '提醒一下' });
    expect(res.statusCode).toBe(200);
    // Strict response keys: no delivered / notificationEnabled field leaked
    expect(Object.keys(res.json().data).sort()).toEqual([
      'cooldownEndsAt',
      'ledgerId',
      'remindedAt',
      'transferId',
    ]);

    // No notification row inserted for 小丁
    const dingRows = await fixture.db.orm
      .select()
      .from(notifications)
      .where(eq(notifications.recipientUserId, s.ding.user.id));
    expect(dingRows).toHaveLength(0);

    // Second call inside cooldown STILL returns 429 REMINDER_COOLDOWN (no side-channel leak)
    const repeat = await remind(s.ledgerId, s.dingToBai.id, s.bai.accessToken);
    expect(repeat.statusCode).toBe(429);
    expect(repeat.json().error.code).toBe('REMINDER_COOLDOWN');
  });

  it('rejects ACTIVE ledgers, PAID transfers, and SETTLED ledgers while preserving idempotent replay', async () => {
    const s = await seedGushanSettling();

    // ACTIVE ledger -> 409 LEDGER_STATE_INVALID
    const activeLedgerId = await fixture.ledger(s.an, [s.bai]);
    const activeRes = await remind(activeLedgerId, randomUUID(), s.an.accessToken);
    expect(activeRes.statusCode).toBe(409);
    expect(activeRes.json().error.code).toBe('LEDGER_STATE_INVALID');

    // Send a reminder while SETTLING + PENDING so we can test replay after PAID/SETTLED
    const savedKey = randomUUID();
    const okRes = await remind(s.ledgerId, s.dingToBai.id, s.bai.accessToken, {}, savedKey);
    expect(okRes.statusCode).toBe(200);

    // Mark dingToBai as PAID -> new reminder rejected with 409 LEDGER_STATE_INVALID
    const markDing = await fixture.app.inject({
      method: 'POST',
      url: `/api/v1/ledgers/${s.ledgerId}/settlement/transfers/${s.dingToBai.id}/paid`,
      headers: authHeaders(s.ding.accessToken),
      payload: {},
    });
    expect(markDing.statusCode).toBe(200);

    const paidReject = await remind(s.ledgerId, s.dingToBai.id, s.bai.accessToken);
    expect(paidReject.statusCode).toBe(409);
    expect(paidReject.json().error.code).toBe('LEDGER_STATE_INVALID');

    // Replaying the original key while transfer is PAID (before SETTLED) returns cached 200
    const replayAfterPaid = await remind(
      s.ledgerId,
      s.dingToBai.id,
      s.bai.accessToken,
      {},
      savedKey,
    );
    expect(replayAfterPaid.statusCode).toBe(200);
    expect(replayAfterPaid.json().data).toEqual(okRes.json().data);

    // Mark remaining transfer PAID and settle ledger -> SETTLED rejects new reminder with 409
    const markChen = await fixture.app.inject({
      method: 'POST',
      url: `/api/v1/ledgers/${s.ledgerId}/settlement/transfers/${s.chenToAn.id}/paid`,
      headers: authHeaders(s.chen.accessToken),
      payload: {},
    });
    expect(markChen.statusCode).toBe(200);
    const settleRes = await fixture.app.inject({
      method: 'POST',
      url: `/api/v1/ledgers/${s.ledgerId}/settle`,
      headers: authHeaders(s.an.accessToken),
    });
    expect(settleRes.statusCode).toBe(200);

    const beforeSettledChecks = await financialSnapshot(s.ledgerId, s.an.accessToken);

    const settledReject = await remind(s.ledgerId, s.chenToAn.id, s.an.accessToken);
    expect(settledReject.statusCode).toBe(409);
    expect(settledReject.json().error.code).toBe('LEDGER_STATE_INVALID');

    // Replaying the original key after SETTLED still returns the cached 200 response
    const replayAfterSettled = await remind(
      s.ledgerId,
      s.dingToBai.id,
      s.bai.accessToken,
      {},
      savedKey,
    );
    expect(replayAfterSettled.statusCode).toBe(200);
    expect(replayAfterSettled.json().data).toEqual(okRes.json().data);

    // Same key with different body after SETTLED -> 409 IDEMPOTENCY_CONFLICT
    const conflictAfterSettled = await remind(
      s.ledgerId,
      s.dingToBai.id,
      s.bai.accessToken,
      { note: '结清后换体' },
      savedKey,
    );
    expect(conflictAfterSettled.statusCode).toBe(409);
    expect(conflictAfterSettled.json().error.code).toBe('IDEMPOTENCY_CONFLICT');

    expect(await financialSnapshot(s.ledgerId, s.an.accessToken)).toEqual(beforeSettledChecks);
  });

  it('rejects cross-ledger transfer IDs and invalid payloads without side effects', async () => {
    const s1 = await seedGushanSettling();
    const s2 = await seedGushanSettling();
    const before = await financialSnapshot(s1.ledgerId, s1.an.accessToken);

    // Valid transferId from another ledger -> 404 TRANSFER_NOT_FOUND
    const crossLedger = await remind(s1.ledgerId, s2.dingToBai.id, s1.an.accessToken);
    expect(crossLedger.statusCode).toBe(404);
    expect(crossLedger.json().error.code).toBe('TRANSFER_NOT_FOUND');

    // Non-UUID idempotency key -> 400 VALIDATION_ERROR
    const badKey = await remind(s1.ledgerId, s1.dingToBai.id, s1.bai.accessToken, {}, 'not-a-uuid');
    expect(badKey.statusCode).toBe(400);
    expect(badKey.json().error.code).toBe('VALIDATION_ERROR');

    // Blank / overlong note and unknown extra fields -> 400 VALIDATION_ERROR
    for (const payload of [
      { note: '   ' },
      { note: '催'.repeat(121) },
      { note: '正常备注', extraField: true },
    ]) {
      const invalid = await remind(s1.ledgerId, s1.dingToBai.id, s1.bai.accessToken, payload);
      expect(invalid.statusCode).toBe(400);
      expect(invalid.json().error.code).toBe('VALIDATION_ERROR');
    }

    // Leading/trailing whitespace in note is trimmed before persistence
    const trimmed = await remind(s1.ledgerId, s1.dingToBai.id, s1.bai.accessToken, {
      note: '  请方便时转一下  ',
    });
    expect(trimmed.statusCode).toBe(200);
    const dingList = await fixture.app.inject({
      url: '/api/v1/me/notifications?unreadOnly=true',
      headers: { authorization: `Bearer ${s1.ding.accessToken}` },
    });
    expect(dingList.statusCode).toBe(200);
    expect(endpoints.listNotifications.response.parse(dingList.json()).data[0]?.note).toBe(
      '请方便时转一下',
    );

    expect(await financialSnapshot(s1.ledgerId, s1.an.accessToken)).toEqual(before);
  });

  it('serializes concurrent reminders on the same transfer and isolates idempotency scopes', async () => {
    const s = await seedGushanSettling();
    const before = await financialSnapshot(s.ledgerId, s.an.accessToken);

    // Payee and non-payer creator race on the same transfer with different keys -> 1x 200, 1x 429
    const keyPayee = randomUUID();
    const keyCreator = randomUUID();
    const [r1, r2] = await Promise.all([
      remind(s.ledgerId, s.dingToBai.id, s.bai.accessToken, { note: '收款人催还' }, keyPayee),
      remind(s.ledgerId, s.dingToBai.id, s.an.accessToken, { note: '创建者催还' }, keyCreator),
    ]);
    const statuses = [r1.statusCode, r2.statusCode].sort();
    expect(statuses).toEqual([200, 429]);
    const rejected = r1.statusCode === 429 ? r1 : r2;
    expect(rejected.json().error.code).toBe('REMINDER_COOLDOWN');

    // Exactly one notification and one TRANSFER_REMINDED audit row exist for dingToBai
    const dingNotifs = await fixture.db.orm
      .select()
      .from(notifications)
      .where(eq(notifications.transferId, s.dingToBai.id));
    expect(dingNotifs).toHaveLength(1);
    const remindLogs = await fixture.db.orm
      .select()
      .from(operationLogs)
      .where(
        and(
          eq(operationLogs.ledgerId, s.ledgerId),
          eq(operationLogs.action, 'TRANSFER_REMINDED'),
          eq(operationLogs.targetId, s.dingToBai.id),
        ),
      );
    expect(remindLogs).toHaveLength(1);

    // Same user concurrent replay with the same key returns identical 200 without duplicate writes
    const sharedKey = randomUUID();
    const [c1, c2] = await Promise.all([
      remind(s.ledgerId, s.chenToAn.id, s.an.accessToken, { note: '并发重放' }, sharedKey),
      remind(s.ledgerId, s.chenToAn.id, s.an.accessToken, { note: '并发重放' }, sharedKey),
    ]);
    expect(c1.statusCode).toBe(200);
    expect(c2.statusCode).toBe(200);
    expect(c2.json().data).toEqual(c1.json().data);

    const chenNotifs = await fixture.db.orm
      .select()
      .from(notifications)
      .where(eq(notifications.transferId, s.chenToAn.id));
    expect(chenNotifs).toHaveLength(1);

    // Another authorized user reusing the same key on the same transfer does NOT replay; hits cooldown
    const winnerKey = r1.statusCode === 200 ? keyPayee : keyCreator;
    const otherToken = r1.statusCode === 200 ? s.an.accessToken : s.bai.accessToken;
    const crossUserSameKey = await remind(s.ledgerId, s.dingToBai.id, otherToken, {}, winnerKey);
    expect(crossUserSameKey.statusCode).toBe(429);
    expect(crossUserSameKey.json().error.code).toBe('REMINDER_COOLDOWN');

    // Same user reusing the same key on a DIFFERENT transfer succeeds independently
    const expiredAt = new Date(Date.now() - DEFAULT_REMINDER_COOLDOWN_MS - 1000);
    await fixture.db.orm
      .update(operationLogs)
      .set({ createdAt: expiredAt })
      .where(
        and(
          eq(operationLogs.ledgerId, s.ledgerId),
          eq(operationLogs.action, 'TRANSFER_REMINDED'),
          eq(operationLogs.targetId, s.dingToBai.id),
        ),
      );
    const sameKeyDifferentTransfer = await remind(
      s.ledgerId,
      s.dingToBai.id,
      s.an.accessToken,
      { note: '并发重放' },
      sharedKey,
    );
    expect(sameKeyDifferentTransfer.statusCode).toBe(200);
    expect(sameKeyDifferentTransfer.json().data.transferId).toBe(s.dingToBai.id);

    expect(await financialSnapshot(s.ledgerId, s.an.accessToken)).toEqual(before);
  });

  it('links A29 silence, cooldown parity, A33/A34 read flow, and Gushan conservation', async () => {
    const s = await seedGushanSettling();
    const before = await financialSnapshot(s.ledgerId, s.an.accessToken);
    expect(before.balances.expenseTotalCents).toBe('30000');
    expect(before.settlement.transferTotalCents).toBe('9000');
    expect(before.settlement.progress).toEqual({
      paidCount: 0,
      totalCount: 2,
      remainingCents: '9000',
    });

    // Disable notifications for 小丁, send silent reminder, replay, and verify cooldown parity
    const disableRes = await fixture.app.inject({
      method: 'PATCH',
      url: '/api/v1/me/preferences',
      headers: { authorization: `Bearer ${s.ding.accessToken}` },
      payload: { notificationEnabled: false },
    });
    expect(disableRes.statusCode).toBe(200);

    const silentKey = randomUUID();
    const silentRes = await remind(
      s.ledgerId,
      s.dingToBai.id,
      s.bai.accessToken,
      { note: '静默期提醒' },
      silentKey,
    );
    expect(silentRes.statusCode).toBe(200);
    const silentReplay = await remind(
      s.ledgerId,
      s.dingToBai.id,
      s.bai.accessToken,
      { note: '静默期提醒' },
      silentKey,
    );
    expect(silentReplay.statusCode).toBe(200);
    expect(silentReplay.json().data).toEqual(silentRes.json().data);

    const silentCooldown = await remind(s.ledgerId, s.dingToBai.id, s.an.accessToken);
    expect(silentCooldown.statusCode).toBe(429);
    expect(silentCooldown.json().error.code).toBe('REMINDER_COOLDOWN');

    // Compare cooldown error shape against enabled transfer (chenToAn) -> indistinguishable
    const enabledRes = await remind(s.ledgerId, s.chenToAn.id, s.an.accessToken);
    expect(enabledRes.statusCode).toBe(200);
    const enabledCooldown = await remind(s.ledgerId, s.chenToAn.id, s.an.accessToken);
    expect(enabledCooldown.statusCode).toBe(429);
    expect(silentCooldown.json().error).toEqual(enabledCooldown.json().error);
    expect(Object.keys(silentRes.json().data).sort()).toEqual(
      Object.keys(enabledRes.json().data).sort(),
    );

    // Re-enable A29 for 小丁, expire cooldown, deliver reminder, then read via A33 & A34
    const enableRes = await fixture.app.inject({
      method: 'PATCH',
      url: '/api/v1/me/preferences',
      headers: { authorization: `Bearer ${s.ding.accessToken}` },
      payload: { notificationEnabled: true },
    });
    expect(enableRes.statusCode).toBe(200);

    await fixture.db.orm
      .update(operationLogs)
      .set({ createdAt: new Date(Date.now() - DEFAULT_REMINDER_COOLDOWN_MS - 1000) })
      .where(
        and(
          eq(operationLogs.ledgerId, s.ledgerId),
          eq(operationLogs.action, 'TRANSFER_REMINDED'),
          eq(operationLogs.targetId, s.dingToBai.id),
        ),
      );

    const deliveredRes = await remind(s.ledgerId, s.dingToBai.id, s.an.accessToken, {
      note: '开启后催还',
    });
    expect(deliveredRes.statusCode).toBe(200);

    const unreadRes = await fixture.app.inject({
      url: '/api/v1/me/notifications?unreadOnly=true',
      headers: { authorization: `Bearer ${s.ding.accessToken}` },
    });
    expect(unreadRes.statusCode).toBe(200);
    const unreadItems = endpoints.listNotifications.response.parse(unreadRes.json()).data;
    expect(unreadItems).toHaveLength(1);
    expect(unreadItems[0]).toMatchObject({
      type: 'SETTLEMENT_REMINDER',
      ledgerId: s.ledgerId,
      transferId: s.dingToBai.id,
      actorUserId: s.an.user.id,
      amountCents: '6000',
      note: '开启后催还',
      readAt: null,
    });

    const readRes = await fixture.app.inject({
      method: 'POST',
      url: `/api/v1/me/notifications/${unreadItems[0]!.id}/read`,
      headers: { authorization: `Bearer ${s.ding.accessToken}` },
    });
    expect(readRes.statusCode).toBe(200);
    expect(endpoints.markNotificationRead.response.parse(readRes.json()).data.readAt).toBeTruthy();

    // Financial state & Gushan conservation remain strictly untouched across the entire flow
    expect(await financialSnapshot(s.ledgerId, s.an.accessToken)).toEqual(before);
  });
});
