import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { endpoints } from '@tongzhang/contracts';
import {
  expenseImages,
  expenseSplits,
  expenses,
  idempotencyKeys,
  ledgerMembers,
  ledgers,
  notifications,
  operationLogs,
  settlementBatches,
  settlementTransfers,
  users,
} from '../src/db/schema/index.js';
import { createDatabase } from '../src/db/client.js';
import { DEFAULT_REMINDER_COOLDOWN_MS } from '../src/modules/settlements/remind.js';
import { createDeterministicAiDraftDouble } from './fixtures/ai-draft-double.js';
import { testDatabaseUrl } from './fixtures/database.js';
import { imageBytes, imageMultipart } from './fixtures/images.js';
import { integrationFixture, type TestAccount } from './fixtures/integration.js';
import { seedSettlingReminderScenario } from './fixtures/notifications.js';

const openFixtures: Array<Awaited<ReturnType<typeof integrationFixture>>> = [];

afterEach(async () => {
  await Promise.all(openFixtures.splice(0).map((f) => f.close()));
});

async function uploadImage(
  fixture: Awaited<ReturnType<typeof integrationFixture>>,
  account: TestAccount,
  kind: 'RECEIPT' | 'COVER' = 'RECEIPT',
) {
  const bytes = await imageBytes('png');
  const form = imageMultipart(bytes, 'image/png', [['kind', kind]]);
  const res = await fixture.app.inject({
    method: 'POST',
    url: '/api/v1/images',
    headers: { authorization: `Bearer ${account.accessToken}`, ...form.headers },
    payload: form.payload,
  });
  expect(res.statusCode).toBe(201);
  return res.json().data.imageId as string;
}

const uploadReceipt = (
  fixture: Awaited<ReturnType<typeof integrationFixture>>,
  account: TestAccount,
) => uploadImage(fixture, account, 'RECEIPT');

describe('A31 AI draft Test Double and notifications isolated-DB fixture regressions', () => {
  it('parses text/receipt/dirty/502 via deterministic AI double with zero DB side effects until explicit A13 confirmation', async () => {
    const aiDouble = createDeterministicAiDraftDouble('valid-equal');
    const fixture = await integrationFixture({ aiDraftProvider: aiDouble });
    openFixtures.push(fixture);

    const owner = await fixture.register('小安');
    const friend = await fixture.register('小白');
    const ledgerId = await fixture.ledger(owner, [friend]);
    const receiptImageId = await uploadReceipt(fixture, owner);

    aiDouble.enqueueScenario('valid-equal');
    aiDouble.enqueueScenario('dirty-output');
    aiDouble.enqueueScenario('upstream-502');

    // 1. Valid receipt + text parse returns normalized draft without writing expenses or bumping ledger version.
    const parsedRes = await fixture.app.inject({
      method: 'POST',
      url: `/api/v1/ledgers/${ledgerId}/expenses/ai-draft`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: {
        text: '晚餐 120 元 AA',
        receiptImageId,
        referenceDate: '2026-11-18',
      },
    });
    expect(parsedRes.statusCode).toBe(200);
    const draft = endpoints.parseExpenseDraft.response.parse(parsedRes.json()).data;
    expect(draft.amountCents).toBe('12000');
    expect(draft.receiptImageId).toBe(receiptImageId);
    expect(draft.splitMode).toBe('EQUAL');
    expect(draft.splits).toHaveLength(2);
    expect(aiDouble.calls[0]?.receiptImage?.mimeType).toBe('image/png');

    // 2. Dirty model output is safely normalized with warnings and still writes nothing to DB.
    const dirtyRes = await fixture.app.inject({
      method: 'POST',
      url: `/api/v1/ledgers/${ledgerId}/expenses/ai-draft`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { text: '模糊消费', referenceDate: '2026-11-18' },
    });
    expect(dirtyRes.statusCode).toBe(200);
    const dirtyDraft = endpoints.parseExpenseDraft.response.parse(dirtyRes.json()).data;
    expect(dirtyDraft.warnings.length).toBeGreaterThan(0);
    expect(dirtyDraft.category).toBe('OTHER');

    // 3. Upstream failure returns 502 AI_DRAFT_UPSTREAM_ERROR cleanly.
    const failedRes = await fixture.app.inject({
      method: 'POST',
      url: `/api/v1/ledgers/${ledgerId}/expenses/ai-draft`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { text: '会失败的请求' },
    });
    expect(failedRes.statusCode).toBe(502);
    expect(failedRes.json().error.code).toBe('AI_DRAFT_UPSTREAM_ERROR');

    // Verify ZERO writes to expenses, splits, bindings, logs, idempotency, or ledger version.
    const [expenseRows, splitRows, bindingRows, logRows, idemRows, [ledgerRow]] = await Promise.all(
      [
        fixture.db.orm.select().from(expenses).where(eq(expenses.ledgerId, ledgerId)),
        fixture.db.orm.select().from(expenseSplits).where(eq(expenseSplits.ledgerId, ledgerId)),
        fixture.db.orm.select().from(expenseImages).where(eq(expenseImages.ledgerId, ledgerId)),
        fixture.db.orm.select().from(operationLogs).where(eq(operationLogs.ledgerId, ledgerId)),
        fixture.db.orm
          .select()
          .from(idempotencyKeys)
          .where(eq(idempotencyKeys.userId, owner.user.id)),
        fixture.db.orm.select().from(ledgers).where(eq(ledgers.id, ledgerId)),
      ],
    );
    expect(expenseRows).toHaveLength(0);
    expect(splitRows).toHaveLength(0);
    expect(bindingRows).toHaveLength(0);
    expect(logRows).toHaveLength(0);
    expect(idemRows).toHaveLength(0);
    expect(ledgerRow?.version).toBe(1);

    // 4. Explicit manual confirmation via A13 persists the expense and binds the receipt image.
    const memberRows = await fixture.db.orm
      .select()
      .from(ledgerMembers)
      .where(eq(ledgerMembers.ledgerId, ledgerId));
    const ownerMemberId = memberRows.find((m) => m.userId === owner.user.id)!.id;
    const confirmRes = await fixture.app.inject({
      method: 'POST',
      url: `/api/v1/ledgers/${ledgerId}/expenses`,
      headers: {
        authorization: `Bearer ${owner.accessToken}`,
        'idempotency-key': randomUUID(),
      },
      payload: {
        title: draft.title ?? '收据识别晚餐',
        amountCents: draft.amountCents!,
        category: draft.category,
        occurredOn: draft.occurredOn!,
        payerMemberId: draft.payerMemberId ?? ownerMemberId,
        splitMode: draft.splitMode,
        splits: draft.splits.map((s) => ({ memberId: s.memberId })),
        note: draft.note,
        receiptImageId: draft.receiptImageId,
      },
    });
    expect(confirmRes.statusCode).toBe(201);
    const created = endpoints.createExpense.response.parse(confirmRes.json()).data;
    expect(created.amountCents).toBe('12000');
    expect(created.receiptImageId).toBe(receiptImageId);
  });

  it('exercises A32/A33/A34/A29 via notifications fixture with silent preference opt-out, cross-user isolation, and zero residual rows after close', async () => {
    const fixture = await integrationFixture();
    const scenario = await seedSettlingReminderScenario(fixture, {
      ledgerName: 'Day3提醒夹具账本',
    });

    try {
      expect(scenario.transfers).toHaveLength(1);
      const transfer = scenario.transfers[0]!;
      expect(transfer.amountCents).toBe('6000');
      expect(transfer.payerMemberId).toBe(scenario.memberIds.payer);
      expect(transfer.payeeMemberId).toBe(scenario.memberIds.payee);

      // 1. Payer and outsider cannot trigger reminder (403 FORBIDDEN).
      const payerSelfRemind = await scenario.remind(scenario.payer, transfer.id);
      expect(payerSelfRemind.statusCode).toBe(403);
      const outsiderRemind = await scenario.remind(scenario.outsider, transfer.id);
      expect(outsiderRemind.statusCode).toBe(403);

      // 2. Payee sends reminder -> delivered to payer's A33 inbox; cooldown blocks immediate repeat.
      const firstKey = randomUUID();
      const firstRemind = await scenario.remind(scenario.payee, transfer.id, firstKey);
      expect(firstRemind.statusCode).toBe(200);
      const firstBody = endpoints.remindTransfer.response.parse(firstRemind.json()).data;
      expect(firstBody.ledgerId).toBe(scenario.ledgerId);
      expect(firstBody.transferId).toBe(transfer.id);
      expect(Date.parse(firstBody.cooldownEndsAt)).toBeGreaterThan(
        Date.parse(firstBody.remindedAt),
      );

      const immediateRepeat = await scenario.remind(scenario.payee, transfer.id);
      expect(immediateRepeat.statusCode).toBe(429);
      expect(immediateRepeat.json().error.code).toBe('REMINDER_COOLDOWN');

      // 3. Payer lists unread notifications via A33; outsider and payee see 0 items.
      const payerInbox = await scenario.listNotifications(scenario.payer, { unreadOnly: true });
      expect(payerInbox.statusCode).toBe(200);
      const payerList = endpoints.listNotifications.response.parse(payerInbox.json()).data;
      expect(payerList).toHaveLength(1);
      const notificationId = payerList[0]!.id;
      expect(payerList[0]!.ledgerId).toBe(scenario.ledgerId);
      expect(payerList[0]!.transferId).toBe(transfer.id);
      expect(payerList[0]!.readAt).toBeNull();

      const outsiderInbox = await scenario.listNotifications(scenario.outsider);
      expect(endpoints.listNotifications.response.parse(outsiderInbox.json()).data).toHaveLength(0);

      // Cross-user mark-read is rejected (403 FORBIDDEN).
      const outsiderRead = await scenario.markNotificationRead(scenario.outsider, notificationId);
      expect(outsiderRead.statusCode).toBe(403);
      expect(outsiderRead.json().error.code).toBe('FORBIDDEN');

      // 4. Payer marks notification read via A34 -> unreadOnly now returns empty.
      const readRes = await scenario.markNotificationRead(scenario.payer, notificationId);
      expect(readRes.statusCode).toBe(200);
      expect(
        endpoints.markNotificationRead.response.parse(readRes.json()).data.readAt,
      ).not.toBeNull();

      const unreadAfter = await scenario.listNotifications(scenario.payer, { unreadOnly: true });
      expect(endpoints.listNotifications.response.parse(unreadAfter.json()).data).toHaveLength(0);

      // 5. Payer disables A29 notificationEnabled -> after cooldown expires, owner's remind succeeds
      // without leaking opt-out state and does not insert a new notification row.
      const optOut = await scenario.setNotificationEnabled(scenario.payer, false);
      expect(optOut.statusCode).toBe(200);
      await fixture.db.orm
        .update(operationLogs)
        .set({ createdAt: new Date(Date.now() - DEFAULT_REMINDER_COOLDOWN_MS - 60_000) })
        .where(eq(operationLogs.ledgerId, scenario.ledgerId));

      const suppressedRemind = await scenario.remind(scenario.owner, transfer.id);
      expect(suppressedRemind.statusCode).toBe(200);
      const suppressedBody = endpoints.remindTransfer.response.parse(suppressedRemind.json()).data;
      expect(suppressedBody.transferId).toBe(transfer.id);
      expect(Date.parse(suppressedBody.cooldownEndsAt)).toBeGreaterThan(
        Date.parse(suppressedBody.remindedAt),
      );

      // Still only 1 notification row in DB for this ledger.
      const notifRows = await fixture.db.orm
        .select()
        .from(notifications)
        .where(eq(notifications.ledgerId, scenario.ledgerId));
      expect(notifRows).toHaveLength(1);

      // 6. Marking transfer PAID blocks subsequent reminders (409 LEDGER_STATE_INVALID).
      const paidRes = await scenario.markTransferPaid(scenario.owner, transfer.id);
      expect(paidRes.statusCode).toBe(200);
      const afterPaidRemind = await scenario.remind(scenario.owner, transfer.id);
      expect(afterPaidRemind.statusCode).toBe(409);
      expect(afterPaidRemind.json().error.code).toBe('LEDGER_STATE_INVALID');
    } finally {
      await fixture.close();
    }

    // Verify zero residual rows owned by this fixture across core tables (parallel-suite safe).
    const ownedUserIds = [
      scenario.owner.user.id,
      scenario.payee.user.id,
      scenario.payer.user.id,
      scenario.outsider.user.id,
    ];
    const probeDb = createDatabase({ connectionString: testDatabaseUrl() });
    try {
      const [
        remNotifs,
        remTransfers,
        remBatches,
        remExpenses,
        remSplits,
        remLedgers,
        remMembers,
        remLogs,
        remIdem,
        remUsers,
      ] = await Promise.all([
        probeDb.orm
          .select()
          .from(notifications)
          .where(eq(notifications.ledgerId, scenario.ledgerId)),
        probeDb.orm
          .select()
          .from(settlementTransfers)
          .where(eq(settlementTransfers.ledgerId, scenario.ledgerId)),
        probeDb.orm
          .select()
          .from(settlementBatches)
          .where(eq(settlementBatches.ledgerId, scenario.ledgerId)),
        probeDb.orm.select().from(expenses).where(eq(expenses.ledgerId, scenario.ledgerId)),
        probeDb.orm
          .select()
          .from(expenseSplits)
          .where(eq(expenseSplits.ledgerId, scenario.ledgerId)),
        probeDb.orm.select().from(ledgers).where(eq(ledgers.id, scenario.ledgerId)),
        probeDb.orm
          .select()
          .from(ledgerMembers)
          .where(eq(ledgerMembers.ledgerId, scenario.ledgerId)),
        probeDb.orm
          .select()
          .from(operationLogs)
          .where(eq(operationLogs.ledgerId, scenario.ledgerId)),
        probeDb.orm
          .select()
          .from(idempotencyKeys)
          .where(inArray(idempotencyKeys.userId, ownedUserIds)),
        probeDb.orm.select().from(users).where(inArray(users.id, ownedUserIds)),
      ]);
      expect(remNotifs).toHaveLength(0);
      expect(remTransfers).toHaveLength(0);
      expect(remBatches).toHaveLength(0);
      expect(remExpenses).toHaveLength(0);
      expect(remSplits).toHaveLength(0);
      expect(remLedgers).toHaveLength(0);
      expect(remMembers).toHaveLength(0);
      expect(remLogs).toHaveLength(0);
      expect(remIdem).toHaveLength(0);
      expect(remUsers).toHaveLength(0);
    } finally {
      await probeDb.close();
    }
  });

  it('intercepts cross-user receipt, cover image, bound receipt, non-member, and frozen ledger before invoking AI double and returns 503 cleanly', async () => {
    const aiDouble = createDeterministicAiDraftDouble('valid-equal');
    const fixture = await integrationFixture({ aiDraftProvider: aiDouble });
    let ledgerId: string | undefined;
    const ownedUserIds: string[] = [];

    try {
      const owner = await fixture.register('小安');
      const friend = await fixture.register('小白');
      const outsider = await fixture.register('外人');
      ownedUserIds.push(owner.user.id, friend.user.id, outsider.user.id);
      ledgerId = await fixture.ledger(owner, [friend]);

      const friendReceiptId = await uploadReceipt(fixture, friend);
      const ownerCoverId = await uploadImage(fixture, owner, 'COVER');
      const ownerReceiptId = await uploadReceipt(fixture, owner);

      // 1. Cross-user receipt image is blocked (403 FORBIDDEN) and AI provider is NEVER invoked.
      const crossUserRes = await fixture.app.inject({
        method: 'POST',
        url: `/api/v1/ledgers/${ledgerId}/expenses/ai-draft`,
        headers: { authorization: `Bearer ${owner.accessToken}` },
        payload: { text: '用他人收据尝试解析', receiptImageId: friendReceiptId },
      });
      expect(crossUserRes.statusCode).toBe(403);
      expect(crossUserRes.json().error.code).toBe('FORBIDDEN');
      expect(aiDouble.calls).toHaveLength(0);

      // 2. Non-receipt (COVER) image is blocked (400 IMAGE_INVALID) before invoking AI provider.
      const coverRes = await fixture.app.inject({
        method: 'POST',
        url: `/api/v1/ledgers/${ledgerId}/expenses/ai-draft`,
        headers: { authorization: `Bearer ${owner.accessToken}` },
        payload: { text: '用封面图解析', receiptImageId: ownerCoverId },
      });
      expect(coverRes.statusCode).toBe(400);
      expect(coverRes.json().error.code).toBe('IMAGE_INVALID');
      expect(aiDouble.calls).toHaveLength(0);

      // 3. Non-member is blocked (403 FORBIDDEN) before invoking AI provider.
      const outsiderRes = await fixture.app.inject({
        method: 'POST',
        url: `/api/v1/ledgers/${ledgerId}/expenses/ai-draft`,
        headers: { authorization: `Bearer ${outsider.accessToken}` },
        payload: { text: '越权解析' },
      });
      expect(outsiderRes.statusCode).toBe(403);
      expect(outsiderRes.json().error.code).toBe('FORBIDDEN');
      expect(aiDouble.calls).toHaveLength(0);

      // 4. Unconfigured / unavailable provider returns 503 AI_DRAFT_UNAVAILABLE with zero DB writes.
      aiDouble.enqueueScenario('unavailable-503');
      const unavailableRes = await fixture.app.inject({
        method: 'POST',
        url: `/api/v1/ledgers/${ledgerId}/expenses/ai-draft`,
        headers: { authorization: `Bearer ${owner.accessToken}` },
        payload: { text: '服务未配置场景', receiptImageId: ownerReceiptId },
      });
      expect(unavailableRes.statusCode).toBe(503);
      expect(unavailableRes.json().error.code).toBe('AI_DRAFT_UNAVAILABLE');
      expect(aiDouble.calls).toHaveLength(1);

      // Bind ownerReceiptId to a real expense via A13, then verify bound receipt is rejected (400 IMAGE_INVALID).
      const memberRows = await fixture.db.orm
        .select()
        .from(ledgerMembers)
        .where(eq(ledgerMembers.ledgerId, ledgerId));
      const ownerMemberId = memberRows.find((m) => m.userId === owner.user.id)!.id;
      const friendMemberId = memberRows.find((m) => m.userId === friend.user.id)!.id;
      const createdExpense = await fixture.app.inject({
        method: 'POST',
        url: `/api/v1/ledgers/${ledgerId}/expenses`,
        headers: {
          authorization: `Bearer ${owner.accessToken}`,
          'idempotency-key': randomUUID(),
        },
        payload: {
          title: '已绑定收据的消费',
          amountCents: '4000',
          category: 'DINING',
          occurredOn: '2026-11-19',
          payerMemberId: ownerMemberId,
          splitMode: 'EQUAL',
          splits: [{ memberId: ownerMemberId }, { memberId: friendMemberId }],
          receiptImageId: ownerReceiptId,
        },
      });
      expect(createdExpense.statusCode).toBe(201);

      const boundReceiptRes = await fixture.app.inject({
        method: 'POST',
        url: `/api/v1/ledgers/${ledgerId}/expenses/ai-draft`,
        headers: { authorization: `Bearer ${owner.accessToken}` },
        payload: { text: '复用已绑定收据', receiptImageId: ownerReceiptId },
      });
      expect(boundReceiptRes.statusCode).toBe(400);
      expect(boundReceiptRes.json().error.code).toBe('IMAGE_INVALID');
      expect(aiDouble.calls).toHaveLength(1);

      // 5. Freezing the ledger (SETTLING) blocks A31 (409 LEDGER_FROZEN) before invoking AI provider.
      const detail = await fixture.app.inject({
        method: 'GET',
        url: `/api/v1/ledgers/${ledgerId}`,
        headers: { authorization: `Bearer ${owner.accessToken}` },
      });
      const expectedVersion = endpoints.getLedger.response.parse(detail.json()).data.version;
      const freezeRes = await fixture.app.inject({
        method: 'POST',
        url: `/api/v1/ledgers/${ledgerId}/settlement`,
        headers: {
          authorization: `Bearer ${owner.accessToken}`,
          'idempotency-key': randomUUID(),
        },
        payload: { expectedVersion },
      });
      expect(freezeRes.statusCode).toBe(201);

      const frozenParseRes = await fixture.app.inject({
        method: 'POST',
        url: `/api/v1/ledgers/${ledgerId}/expenses/ai-draft`,
        headers: { authorization: `Bearer ${owner.accessToken}` },
        payload: { text: '冻结后尝试解析' },
      });
      expect(frozenParseRes.statusCode).toBe(409);
      expect(frozenParseRes.json().error.code).toBe('LEDGER_FROZEN');
      expect(aiDouble.calls).toHaveLength(1);
    } finally {
      await fixture.close();
    }

    const probeDb = createDatabase({ connectionString: testDatabaseUrl() });
    try {
      const [remLedgers, remUsers] = await Promise.all([
        ledgerId
          ? probeDb.orm.select().from(ledgers).where(eq(ledgers.id, ledgerId))
          : Promise.resolve([]),
        probeDb.orm.select().from(users).where(inArray(users.id, ownedUserIds)),
      ]);
      expect(remLedgers).toHaveLength(0);
      expect(remUsers).toHaveLength(0);
    } finally {
      await probeDb.close();
    }
  });

  it('enforces transfer-level 6h cooldown across payee/creator, idempotent replay in cooldown, A29 opt-out/re-enable, and zero financial mutation', async () => {
    const fixture = await integrationFixture();
    const scenario = await seedSettlingReminderScenario(fixture, {
      ledgerName: 'Day4催还冷却回归账本',
    });

    try {
      const transfer = scenario.transfers[0]!;
      const [ledgerBefore] = await fixture.db.orm
        .select()
        .from(ledgers)
        .where(eq(ledgers.id, scenario.ledgerId));

      // 1. Payee sends initial reminder -> 200 with exact 6-hour cooldown window.
      const firstKey = randomUUID();
      const firstRes = await scenario.remind(scenario.payee, transfer.id, firstKey);
      expect(firstRes.statusCode).toBe(200);
      const firstData = endpoints.remindTransfer.response.parse(firstRes.json()).data;
      expect(Date.parse(firstData.cooldownEndsAt) - Date.parse(firstData.remindedAt)).toBe(
        DEFAULT_REMINDER_COOLDOWN_MS,
      );

      // 2. Same Idempotency-Key replay during cooldown returns cached 200 without duplicating notification.
      const replayRes = await scenario.remind(scenario.payee, transfer.id, firstKey);
      expect(replayRes.statusCode).toBe(200);
      expect(endpoints.remindTransfer.response.parse(replayRes.json()).data).toEqual(firstData);

      // 3. Even switching actor to creator (owner) with a fresh key is blocked by transfer-level 6h cooldown.
      await fixture.db.orm
        .update(operationLogs)
        .set({ createdAt: new Date(Date.now() - DEFAULT_REMINDER_COOLDOWN_MS + 30_000) })
        .where(eq(operationLogs.ledgerId, scenario.ledgerId));
      const ownerInCooldown = await scenario.remind(scenario.owner, transfer.id);
      expect(ownerInCooldown.statusCode).toBe(429);
      expect(ownerInCooldown.json().error.code).toBe('REMINDER_COOLDOWN');

      // 4. Payer disables A29; once 6h expires, owner's remind returns identical 200 shape,
      // writes ZERO new notifications, yet still starts a new 6h cooldown window.
      expect((await scenario.setNotificationEnabled(scenario.payer, false)).statusCode).toBe(200);
      await fixture.db.orm
        .update(operationLogs)
        .set({ createdAt: new Date(Date.now() - DEFAULT_REMINDER_COOLDOWN_MS - 5_000) })
        .where(eq(operationLogs.ledgerId, scenario.ledgerId));

      const silentRes = await scenario.remind(scenario.owner, transfer.id);
      expect(silentRes.statusCode).toBe(200);
      const silentData = endpoints.remindTransfer.response.parse(silentRes.json()).data;
      expect(Date.parse(silentData.cooldownEndsAt) - Date.parse(silentData.remindedAt)).toBe(
        DEFAULT_REMINDER_COOLDOWN_MS,
      );

      // Immediate repeat after silent reminder is still blocked with 429 REMINDER_COOLDOWN (no preference leak).
      const afterSilentRepeat = await scenario.remind(scenario.payee, transfer.id);
      expect(afterSilentRepeat.statusCode).toBe(429);
      expect(afterSilentRepeat.json().error.code).toBe('REMINDER_COOLDOWN');

      // Only the initial 1 notification exists while A29 was off.
      const notifsWhileOff = endpoints.listNotifications.response.parse(
        (await scenario.listNotifications(scenario.payer)).json(),
      ).data;
      expect(notifsWhileOff).toHaveLength(1);

      // 5. Re-enabling A29 + expiring cooldown restores delivery to A33 inbox.
      expect((await scenario.setNotificationEnabled(scenario.payer, true)).statusCode).toBe(200);
      await fixture.db.orm
        .update(operationLogs)
        .set({ createdAt: new Date(Date.now() - DEFAULT_REMINDER_COOLDOWN_MS - 5_000) })
        .where(eq(operationLogs.ledgerId, scenario.ledgerId));

      const resumedRes = await scenario.remind(scenario.owner, transfer.id);
      expect(resumedRes.statusCode).toBe(200);
      const notifsAfterReEnable = endpoints.listNotifications.response.parse(
        (await scenario.listNotifications(scenario.payer, { unreadOnly: true })).json(),
      ).data;
      expect(notifsAfterReEnable).toHaveLength(2);

      // 6. Ledger version, status, and transfer amount/status are completely untouched by reminders.
      const [[ledgerAfter], [transferAfter]] = await Promise.all([
        fixture.db.orm.select().from(ledgers).where(eq(ledgers.id, scenario.ledgerId)),
        fixture.db.orm
          .select()
          .from(settlementTransfers)
          .where(eq(settlementTransfers.id, transfer.id)),
      ]);
      expect(ledgerAfter?.version).toBe(ledgerBefore?.version);
      expect(ledgerAfter?.status).toBe('SETTLING');
      expect(transferAfter?.amountCents).toBe(6000n);
      expect(transferAfter?.status).toBe('PENDING');
    } finally {
      await fixture.close();
    }

    const ownedUserIds = [
      scenario.owner.user.id,
      scenario.payee.user.id,
      scenario.payer.user.id,
      scenario.outsider.user.id,
    ];
    const probeDb = createDatabase({ connectionString: testDatabaseUrl() });
    try {
      const [remNotifs, remLedgers, remUsers] = await Promise.all([
        probeDb.orm
          .select()
          .from(notifications)
          .where(eq(notifications.ledgerId, scenario.ledgerId)),
        probeDb.orm.select().from(ledgers).where(eq(ledgers.id, scenario.ledgerId)),
        probeDb.orm.select().from(users).where(inArray(users.id, ownedUserIds)),
      ]);
      expect(remNotifs).toHaveLength(0);
      expect(remLedgers).toHaveLength(0);
      expect(remUsers).toHaveLength(0);
    } finally {
      await probeDb.close();
    }
  });
});
