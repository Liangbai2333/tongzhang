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

async function uploadReceipt(
  fixture: Awaited<ReturnType<typeof integrationFixture>>,
  account: TestAccount,
) {
  const bytes = await imageBytes('png');
  const form = imageMultipart(bytes, 'image/png', [['kind', 'RECEIPT']]);
  const res = await fixture.app.inject({
    method: 'POST',
    url: '/api/v1/images',
    headers: { authorization: `Bearer ${account.accessToken}`, ...form.headers },
    payload: form.payload,
  });
  expect(res.statusCode).toBe(201);
  return res.json().data.imageId as string;
}

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
});
