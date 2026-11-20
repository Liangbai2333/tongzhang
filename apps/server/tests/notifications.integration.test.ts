import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { and, asc, eq } from 'drizzle-orm';
import type { z } from 'zod';
import { endpoints, errorResponseSchema } from '@tongzhang/contracts';
import { ledgerMembers, notifications, operationLogs } from '../src/db/schema/index.js';
import { deliverSettlementReminderNotification } from '../src/modules/profile/index.js';
import { DEFAULT_REMINDER_COOLDOWN_MS } from '../src/modules/settlements/remind.js';
import { integrationFixture, type TestAccount } from './fixtures/integration.js';

type Response = { statusCode: number; body: string; json: () => unknown };
let fixture: Awaited<ReturnType<typeof integrationFixture>>;

beforeEach(async () => {
  fixture = await integrationFixture();
});

afterEach(async () => {
  await fixture.close();
});

function success<T>(response: Response, schema: z.ZodType<T>, status = 200) {
  expect(response.statusCode).toBe(status);
  const parsed = schema.parse(response.json());
  expect(response.json()).toEqual(parsed);
  return parsed;
}

function rejected(response: Response, status: number, code: string) {
  expect(response.statusCode).toBe(status);
  const parsed = errorResponseSchema.parse(response.json());
  expect(response.json()).toEqual(parsed);
  expect(parsed.error.code).toBe(code);
}

const authHeaders = (account: TestAccount, key?: string) => ({
  authorization: `Bearer ${account.accessToken}`,
  ...(key === undefined ? {} : { 'idempotency-key': key }),
});

/** Create a real SETTLING ledger with one PENDING transfer from payer -> payee. */
async function seedSettlingTransfer(
  owner: TestAccount,
  payer: TestAccount,
  ledgerName = '鼓山一日',
  amountCents = '12000',
) {
  const created = success(
    await fixture.app.inject({
      method: 'POST',
      url: '/api/v1/ledgers',
      headers: authHeaders(owner, randomUUID()),
      payload: { name: ledgerName, coverKey: 'mountain' },
    }),
    endpoints.createLedger.response,
    201,
  ).data;
  const ledgerId = created.ledger.id;

  success(
    await fixture.app.inject({
      method: 'POST',
      url: '/api/v1/invitations/join',
      headers: authHeaders(payer, randomUUID()),
      payload: { code: created.invitation.code },
    }),
    endpoints.joinLedger.response,
  );

  const members = await fixture.db.orm
    .select()
    .from(ledgerMembers)
    .where(eq(ledgerMembers.ledgerId, ledgerId));
  const ownerMemberId = members.find((m) => m.userId === owner.user.id)!.id;
  const payerMemberId = members.find((m) => m.userId === payer.user.id)!.id;

  success(
    await fixture.app.inject({
      method: 'POST',
      url: `/api/v1/ledgers/${ledgerId}/expenses`,
      headers: authHeaders(owner, randomUUID()),
      payload: {
        title: '门票与餐费',
        amountCents,
        category: 'DINING',
        occurredOn: '2026-11-18',
        payerMemberId: ownerMemberId,
        splitMode: 'EQUAL',
        splits: [{ memberId: ownerMemberId }, { memberId: payerMemberId }],
      },
    }),
    endpoints.createExpense.response,
    201,
  );

  const preview = success(
    await fixture.app.inject({
      url: `/api/v1/ledgers/${ledgerId}/settlement-preview`,
      headers: authHeaders(owner),
    }),
    endpoints.previewSettlement.response,
  ).data;

  const started = success(
    await fixture.app.inject({
      method: 'POST',
      url: `/api/v1/ledgers/${ledgerId}/settlement`,
      headers: authHeaders(owner, randomUUID()),
      payload: { expectedVersion: preview.ledgerVersion },
    }),
    endpoints.startSettlement.response,
    201,
  ).data;

  const transfer = started.batch.transfers[0]!;
  expect(transfer.payerMemberId).toBe(payerMemberId);
  expect(transfer.payeeMemberId).toBe(ownerMemberId);
  return {
    ledgerId,
    ledgerName,
    transferId: transfer.id,
    transferAmountCents: BigInt(transfer.amountCents),
  };
}

describe('notifications table constraints, A33/A34 endpoints and A29 preference alignment (issue 122)', () => {
  it('enforces check constraints and composite (ledger_id, transfer_id) foreign key in PostgreSQL', async () => {
    const owner = await fixture.register('约束创建者');
    const payer = await fixture.register('约束付款人');
    const first = await seedSettlingTransfer(owner, payer, '约束账本一');
    const second = await seedSettlingTransfer(owner, payer, '约束账本二');

    // Invalid type
    await expect(
      fixture.db.pool.query(
        `insert into notifications (recipient_user_id, actor_user_id, type, ledger_id, transfer_id, amount_cents)
         values ($1, $2, 'UNKNOWN', $3, $4, 6000)`,
        [payer.user.id, owner.user.id, first.ledgerId, first.transferId],
      ),
    ).rejects.toThrow(/ck_notifications_type/);

    // Self-notification (recipient = actor)
    await expect(
      fixture.db.pool.query(
        `insert into notifications (recipient_user_id, actor_user_id, type, ledger_id, transfer_id, amount_cents)
         values ($1, $1, 'SETTLEMENT_REMINDER', $2, $3, 6000)`,
        [payer.user.id, first.ledgerId, first.transferId],
      ),
    ).rejects.toThrow(/ck_notifications_parties/);

    // Non-positive amount_cents
    await expect(
      fixture.db.pool.query(
        `insert into notifications (recipient_user_id, actor_user_id, type, ledger_id, transfer_id, amount_cents)
         values ($1, $2, 'SETTLEMENT_REMINDER', $3, $4, 0)`,
        [payer.user.id, owner.user.id, first.ledgerId, first.transferId],
      ),
    ).rejects.toThrow(/ck_notifications_amount/);

    // Blank note
    await expect(
      fixture.db.pool.query(
        `insert into notifications (recipient_user_id, actor_user_id, type, ledger_id, transfer_id, amount_cents, note)
         values ($1, $2, 'SETTLEMENT_REMINDER', $3, $4, 6000, '   ')`,
        [payer.user.id, owner.user.id, first.ledgerId, first.transferId],
      ),
    ).rejects.toThrow(/ck_notifications_note/);

    // read_at earlier than created_at
    await expect(
      fixture.db.pool.query(
        `insert into notifications (recipient_user_id, actor_user_id, type, ledger_id, transfer_id, amount_cents, created_at, read_at)
         values ($1, $2, 'SETTLEMENT_REMINDER', $3, $4, 6000, '2026-11-18T10:00:00Z', '2026-11-18T09:59:59Z')`,
        [payer.user.id, owner.user.id, first.ledgerId, first.transferId],
      ),
    ).rejects.toThrow(/ck_notifications_read_at/);

    // Cross-ledger (ledger_id, transfer_id) mismatch rejected by composite FK
    await expect(
      fixture.db.pool.query(
        `insert into notifications (recipient_user_id, actor_user_id, type, ledger_id, transfer_id, amount_cents)
         values ($1, $2, 'SETTLEMENT_REMINDER', $3, $4, 6000)`,
        [payer.user.id, owner.user.id, first.ledgerId, second.transferId],
      ),
    ).rejects.toThrow(/fk_notifications_ledger_id_transfer_id/);

    // Valid row succeeds and prevents deleting referenced transfer (RESTRICT)
    const [inserted] = await fixture.db.orm
      .insert(notifications)
      .values({
        recipientUserId: payer.user.id,
        actorUserId: owner.user.id,
        type: 'SETTLEMENT_REMINDER',
        ledgerId: first.ledgerId,
        transferId: first.transferId,
        amountCents: first.transferAmountCents,
        note: '请核对鼓山结算',
      })
      .returning();
    expect(inserted).toBeTruthy();

    await expect(
      fixture.db.pool.query('delete from settlement_transfers where id = $1', [first.transferId]),
    ).rejects.toThrow(/fk_notifications_ledger_id_transfer_id/);
  });

  it('isolates A33 notifications per user, filters unreadOnly, paginates ties and reflects A28 actor renames', async () => {
    const actor = await fixture.register('催还发起人');
    const payer = await fixture.register('待还付款人');
    const other = await fixture.register('其他接收人');

    const transferForPayer = await seedSettlingTransfer(actor, payer, '鼓山一日', '12000');
    const transferForOther = await seedSettlingTransfer(actor, other, '海边周末', '8000');

    const t1 = new Date('2026-11-18T08:00:00.000Z');
    const t2 = new Date('2026-11-18T09:00:00.000Z');

    // Three notifications for payer (two sharing exact t2 timestamp) + one for other.
    const [n1, n2, n3, nOther] = await fixture.db.orm
      .insert(notifications)
      .values([
        {
          recipientUserId: payer.user.id,
          actorUserId: actor.user.id,
          type: 'SETTLEMENT_REMINDER',
          ledgerId: transferForPayer.ledgerId,
          transferId: transferForPayer.transferId,
          amountCents: transferForPayer.transferAmountCents,
          note: '第一条提醒',
          createdAt: t1,
          readAt: new Date('2026-11-18T08:30:00.000Z'),
        },
        {
          recipientUserId: payer.user.id,
          actorUserId: actor.user.id,
          type: 'SETTLEMENT_REMINDER',
          ledgerId: transferForPayer.ledgerId,
          transferId: transferForPayer.transferId,
          amountCents: transferForPayer.transferAmountCents,
          note: '同刻提醒甲',
          createdAt: t2,
        },
        {
          recipientUserId: payer.user.id,
          actorUserId: actor.user.id,
          type: 'SETTLEMENT_REMINDER',
          ledgerId: transferForPayer.ledgerId,
          transferId: transferForPayer.transferId,
          amountCents: transferForPayer.transferAmountCents,
          note: null,
          createdAt: t2,
        },
        {
          recipientUserId: other.user.id,
          actorUserId: actor.user.id,
          type: 'SETTLEMENT_REMINDER',
          ledgerId: transferForOther.ledgerId,
          transferId: transferForOther.transferId,
          amountCents: transferForOther.transferAmountCents,
          note: '他人的提醒',
          createdAt: t2,
        },
      ])
      .returning();

    // Actor sees 0 notifications (sending reminders does not put them in sender's inbox).
    const actorInbox = success(
      await fixture.app.inject({
        url: '/api/v1/me/notifications',
        headers: authHeaders(actor),
      }),
      endpoints.listNotifications.response,
    );
    expect(actorInbox).toEqual({ data: [], page: { nextCursor: null } });

    // Other sees only nOther.
    const otherInbox = success(
      await fixture.app.inject({
        url: '/api/v1/me/notifications',
        headers: authHeaders(other),
      }),
      endpoints.listNotifications.response,
    );
    expect(otherInbox.data.map((item) => item.id)).toEqual([nOther!.id]);
    expect(otherInbox.data[0]).toMatchObject({
      type: 'SETTLEMENT_REMINDER',
      ledgerId: transferForOther.ledgerId,
      ledgerName: '海边周末',
      transferId: transferForOther.transferId,
      actorUserId: actor.user.id,
      actorName: '催还发起人',
      amountCents: '4000',
      note: '他人的提醒',
      readAt: null,
    });

    // Payer paginates with limit=2 across equal-timestamp ties without duplicates or omissions.
    const expectedOrder = [n2!.id, n3!.id].sort((a, b) => (a < b ? 1 : -1)).concat(n1!.id);
    const page1 = success(
      await fixture.app.inject({
        url: '/api/v1/me/notifications?limit=2',
        headers: authHeaders(payer),
      }),
      endpoints.listNotifications.response,
    );
    expect(page1.data).toHaveLength(2);
    expect(page1.page.nextCursor).toBeTruthy();

    const page2 = success(
      await fixture.app.inject({
        url: `/api/v1/me/notifications?limit=2&cursor=${encodeURIComponent(page1.page.nextCursor!)}`,
        headers: authHeaders(payer),
      }),
      endpoints.listNotifications.response,
    );
    expect(page2.data).toHaveLength(1);
    expect(page2.page.nextCursor).toBeNull();
    expect([...page1.data, ...page2.data].map((item) => item.id)).toEqual(expectedOrder);

    // unreadOnly=true excludes already-read n1.
    const unread = success(
      await fixture.app.inject({
        url: '/api/v1/me/notifications?unreadOnly=true',
        headers: authHeaders(payer),
      }),
      endpoints.listNotifications.response,
    );
    expect(unread.data.map((item) => item.id)).toEqual(expectedOrder.slice(0, 2));
    expect(unread.data.every((item) => item.readAt === null)).toBe(true);

    // Actor renames via A28 -> A33 immediately shows updated actorName.
    success(
      await fixture.app.inject({
        method: 'PATCH',
        url: '/api/v1/me',
        headers: authHeaders(actor),
        payload: { username: '改名后收款人' },
      }),
      endpoints.updateProfile.response,
    );
    const afterRename = success(
      await fixture.app.inject({
        url: '/api/v1/me/notifications?unreadOnly=true',
        headers: authHeaders(payer),
      }),
      endpoints.listNotifications.response,
    );
    expect(afterRename.data.every((item) => item.actorName === '改名后收款人')).toBe(true);

    // Invalid query parameters are rejected with 400 VALIDATION_ERROR.
    rejected(
      await fixture.app.inject({
        url: '/api/v1/me/notifications?unreadOnly=yes',
        headers: authHeaders(payer),
      }),
      400,
      'VALIDATION_ERROR',
    );
    rejected(
      await fixture.app.inject({
        url: '/api/v1/me/notifications?cursor=invalid!',
        headers: authHeaders(payer),
      }),
      400,
      'VALIDATION_ERROR',
    );
  });

  it('restricts A34 markNotificationRead to recipient, preserves first readAt, rejects cross-user/body/unauth', async () => {
    const actor = await fixture.register('已读收款人');
    const payer = await fixture.register('已读付款人');
    const stranger = await fixture.register('无关用户');
    const seeded = await seedSettlingTransfer(actor, payer, '已读测试账本', '10000');

    const [created] = await fixture.db.orm
      .insert(notifications)
      .values({
        recipientUserId: payer.user.id,
        actorUserId: actor.user.id,
        type: 'SETTLEMENT_REMINDER',
        ledgerId: seeded.ledgerId,
        transferId: seeded.transferId,
        amountCents: seeded.transferAmountCents,
        note: '记得确认转账',
      })
      .returning();

    // Cross-user access (actor who sent it and unrelated stranger) returns 403 FORBIDDEN.
    for (const intruder of [actor, stranger]) {
      rejected(
        await fixture.app.inject({
          method: 'POST',
          url: `/api/v1/me/notifications/${created!.id}/read`,
          headers: authHeaders(intruder),
        }),
        403,
        'FORBIDDEN',
      );
    }
    const [stillUnread] = await fixture.db.orm
      .select()
      .from(notifications)
      .where(eq(notifications.id, created!.id));
    expect(stillUnread?.readAt).toBeNull();

    // Non-existent notification returns 404 NOT_FOUND.
    rejected(
      await fixture.app.inject({
        method: 'POST',
        url: `/api/v1/me/notifications/${randomUUID()}/read`,
        headers: authHeaders(payer),
      }),
      404,
      'NOT_FOUND',
    );

    // A34 rejects unexpected JSON body.
    rejected(
      await fixture.app.inject({
        method: 'POST',
        url: `/api/v1/me/notifications/${created!.id}/read`,
        headers: authHeaders(payer),
        payload: {},
      }),
      400,
      'VALIDATION_ERROR',
    );

    // Recipient marks read -> 200 + persisted readAt + audit log.
    const firstRead = success(
      await fixture.app.inject({
        method: 'POST',
        url: `/api/v1/me/notifications/${created!.id}/read`,
        headers: authHeaders(payer),
      }),
      endpoints.markNotificationRead.response,
    ).data;
    expect(firstRead.notificationId).toBe(created!.id);

    // Repeated call by recipient is idempotent and preserves the first readAt timestamp.
    const secondRead = success(
      await fixture.app.inject({
        method: 'POST',
        url: `/api/v1/me/notifications/${created!.id}/read`,
        headers: authHeaders(payer),
      }),
      endpoints.markNotificationRead.response,
    ).data;
    expect(secondRead).toEqual(firstRead);

    // Now unreadOnly=true returns empty while unreadOnly=false still returns the read item.
    expect(
      success(
        await fixture.app.inject({
          url: '/api/v1/me/notifications?unreadOnly=true',
          headers: authHeaders(payer),
        }),
        endpoints.listNotifications.response,
      ).data,
    ).toEqual([]);
    const allItems = success(
      await fixture.app.inject({
        url: '/api/v1/me/notifications?unreadOnly=false',
        headers: authHeaders(payer),
      }),
      endpoints.listNotifications.response,
    ).data;
    expect(allItems).toHaveLength(1);
    expect(allItems[0]?.readAt).toBe(firstRead.readAt);

    const audits = await fixture.db.orm
      .select()
      .from(operationLogs)
      .where(eq(operationLogs.actorUserId, payer.user.id))
      .orderBy(asc(operationLogs.createdAt));
    const readAudits = audits.filter((row) => row.action === 'NOTIFICATION_READ');
    expect(readAudits).toHaveLength(2);
    expect(readAudits[0]).toMatchObject({
      ledgerId: seeded.ledgerId,
      targetType: 'NOTIFICATION',
      targetId: created!.id,
      details: { alreadyRead: false, readAt: firstRead.readAt },
    });
    expect(readAudits[1]).toMatchObject({
      ledgerId: seeded.ledgerId,
      targetType: 'NOTIFICATION',
      targetId: created!.id,
      details: { alreadyRead: true, readAt: firstRead.readAt },
    });

    // Revoked session is rejected with 401 UNAUTHENTICATED on both A33 and A34.
    expect(
      (
        await fixture.app.inject({
          method: 'POST',
          url: '/api/v1/auth/logout',
          headers: authHeaders(payer),
        })
      ).statusCode,
    ).toBe(200);
    rejected(
      await fixture.app.inject({
        url: '/api/v1/me/notifications',
        headers: authHeaders(payer),
      }),
      401,
      'UNAUTHENTICATED',
    );
    rejected(
      await fixture.app.inject({
        method: 'POST',
        url: `/api/v1/me/notifications/${created!.id}/read`,
        headers: authHeaders(payer),
      }),
      401,
      'UNAUTHENTICATED',
    );
  });

  it('aligns reminder delivery with A29 notification_enabled while keeping existing notifications readable', async () => {
    const actor = await fixture.register('偏好收款人');
    const payer = await fixture.register('偏好付款人');
    const seeded = await seedSettlingTransfer(actor, payer, '偏好联动账本', '6000');

    // 1. Default notification_enabled=true -> reminder delivered as unread notification.
    const delivered = await fixture.db.orm.transaction((tx) =>
      deliverSettlementReminderNotification(tx, {
        recipientUserId: payer.user.id,
        actorUserId: actor.user.id,
        ledgerId: seeded.ledgerId,
        transferId: seeded.transferId,
        amountCents: seeded.transferAmountCents,
        note: '  首条催还  ',
      }),
    );
    expect(delivered.delivered).toBe(true);
    expect(delivered.notificationId).toBeTruthy();

    // 2. Recipient turns notification_enabled=false via A29 -> new reminder silently skipped.
    success(
      await fixture.app.inject({
        method: 'PATCH',
        url: '/api/v1/me/preferences',
        headers: authHeaders(payer),
        payload: { notificationEnabled: false },
      }),
      endpoints.updatePreferences.response,
    );

    const suppressed = await fixture.db.orm.transaction((tx) =>
      deliverSettlementReminderNotification(tx, {
        recipientUserId: payer.user.id,
        actorUserId: actor.user.id,
        ledgerId: seeded.ledgerId,
        transferId: seeded.transferId,
        amountCents: seeded.transferAmountCents,
        note: '关闭后不应落库',
      }),
    );
    expect(suppressed).toEqual({ delivered: false, notificationId: null });

    // Existing notification delivered before turning off remains visible in A33 and markable read in A34.
    const inboxWhileDisabled = success(
      await fixture.app.inject({
        url: '/api/v1/me/notifications?unreadOnly=true',
        headers: authHeaders(payer),
      }),
      endpoints.listNotifications.response,
    ).data;
    expect(inboxWhileDisabled).toHaveLength(1);
    expect(inboxWhileDisabled[0]).toMatchObject({
      id: delivered.notificationId,
      note: '首条催还',
      amountCents: '3000',
    });

    success(
      await fixture.app.inject({
        method: 'POST',
        url: `/api/v1/me/notifications/${delivered.notificationId}/read`,
        headers: authHeaders(payer),
      }),
      endpoints.markNotificationRead.response,
    );

    // 3. Recipient turns notification_enabled=true again via A29 -> new reminders resume delivery.
    success(
      await fixture.app.inject({
        method: 'PATCH',
        url: '/api/v1/me/preferences',
        headers: authHeaders(payer),
        payload: { notificationEnabled: true },
      }),
      endpoints.updatePreferences.response,
    );

    const resumed = await fixture.db.orm.transaction((tx) =>
      deliverSettlementReminderNotification(tx, {
        recipientUserId: payer.user.id,
        actorUserId: actor.user.id,
        ledgerId: seeded.ledgerId,
        transferId: seeded.transferId,
        amountCents: seeded.transferAmountCents,
        note: '   ',
      }),
    );
    expect(resumed.delivered).toBe(true);
    expect(resumed.notificationId).toBeTruthy();

    const unreadAfterResume = success(
      await fixture.app.inject({
        url: '/api/v1/me/notifications?unreadOnly=true',
        headers: authHeaders(payer),
      }),
      endpoints.listNotifications.response,
    ).data;
    expect(unreadAfterResume).toHaveLength(1);
    expect(unreadAfterResume[0]).toMatchObject({
      id: resumed.notificationId,
      note: null,
      readAt: null,
    });
  });
});

async function expireReminderCooldown(ledgerId: string, transferId: string) {
  await fixture.db.orm
    .update(operationLogs)
    .set({ createdAt: new Date(Date.now() - DEFAULT_REMINDER_COOLDOWN_MS - 60_000) })
    .where(
      and(
        eq(operationLogs.ledgerId, ledgerId),
        eq(operationLogs.action, 'TRANSFER_REMINDED'),
        eq(operationLogs.targetId, transferId),
      ),
    );
}

describe('A32 -> notifications -> A33/A34 end-to-end linkage (issue 138)', () => {
  it('links A32 reminders to A33 pagination/unreadOnly/A28 rename and A34 recipient-only idempotent read', async () => {
    const [an, bai, chen, ding, stranger] = await Promise.all(
      ['小安', '小白', '小陈', '小丁', '无关路人'].map((name) => fixture.register(name)),
    );

    // 1. Seed Gushan 4-person baseline (30000 cents -> chen->an 3000, ding->bai 6000) in SETTLING.
    const gushanCreated = success(
      await fixture.app.inject({
        method: 'POST',
        url: '/api/v1/ledgers',
        headers: authHeaders(an!, randomUUID()),
        payload: { name: '鼓山一日', coverKey: 'mountain' },
      }),
      endpoints.createLedger.response,
      201,
    ).data;
    const gushanLedgerId = gushanCreated.ledger.id;
    for (const member of [bai!, chen!, ding!]) {
      success(
        await fixture.app.inject({
          method: 'POST',
          url: '/api/v1/invitations/join',
          headers: authHeaders(member, randomUUID()),
          payload: { code: gushanCreated.invitation.code },
        }),
        endpoints.joinLedger.response,
      );
    }
    const members = await fixture.db.orm
      .select()
      .from(ledgerMembers)
      .where(eq(ledgerMembers.ledgerId, gushanLedgerId));
    const memberIdOf = (acc: TestAccount) => members.find((m) => m.userId === acc.user.id)!.id;
    const allIds = [memberIdOf(an!), memberIdOf(bai!), memberIdOf(chen!), memberIdOf(ding!)];
    for (const [payerMemberId, title, amountCents, participants] of [
      [allIds[0]!, '鼓山食堂', '12000', allIds],
      [allIds[1]!, '鼓山门票', '12000', allIds],
      [allIds[2]!, '鼓山车费', '6000', [allIds[0]!, allIds[2]!]],
    ] as const) {
      success(
        await fixture.app.inject({
          method: 'POST',
          url: `/api/v1/ledgers/${gushanLedgerId}/expenses`,
          headers: authHeaders(an!, randomUUID()),
          payload: {
            title,
            amountCents,
            category: 'DINING',
            occurredOn: '2026-11-19',
            payerMemberId,
            splitMode: 'EQUAL',
            splits: participants.map((memberId) => ({ memberId })),
          },
        }),
        endpoints.createExpense.response,
        201,
      );
    }
    const gushanPreview = success(
      await fixture.app.inject({
        url: `/api/v1/ledgers/${gushanLedgerId}/settlement-preview`,
        headers: authHeaders(an!),
      }),
      endpoints.previewSettlement.response,
    ).data;
    const gushanBatch = success(
      await fixture.app.inject({
        method: 'POST',
        url: `/api/v1/ledgers/${gushanLedgerId}/settlement`,
        headers: authHeaders(an!, randomUUID()),
        payload: { expectedVersion: gushanPreview.ledgerVersion },
      }),
      endpoints.startSettlement.response,
      201,
    ).data.batch;
    const chenToAn = gushanBatch.transfers.find(
      (t) => t.payerMemberId === allIds[2] && t.payeeMemberId === allIds[0],
    )!;
    const dingToBai = gushanBatch.transfers.find(
      (t) => t.payerMemberId === allIds[3] && t.payeeMemberId === allIds[1],
    )!;

    // 2. Seed a second SETTLING ledger where ding also owes an 4000 cents.
    const secondLedger = await seedSettlingTransfer(an!, ding!, '海边夜宵', '8000');

    // 3. Trigger real A32 reminders:
    //    - bai reminds ding (6000 cents, with trimmed note + idempotent replay)
    //    - an reminds chen (3000 cents, no note)
    //    - an reminds ding on secondLedger (4000 cents, no note)
    //    - after cooldown expires, an (creator) reminds ding on gushanLedger (6000 cents)
    const firstKey = randomUUID();
    const remind1 = success(
      await fixture.app.inject({
        method: 'POST',
        url: `/api/v1/ledgers/${gushanLedgerId}/settlement/transfers/${dingToBai.id}/remind`,
        headers: authHeaders(bai!, firstKey),
        payload: { note: '  方便时转一下鼓山门票  ' },
      }),
      endpoints.remindTransfer.response,
    ).data;
    // Idempotent replay with same key does not insert a duplicate notification.
    const remind1Replay = success(
      await fixture.app.inject({
        method: 'POST',
        url: `/api/v1/ledgers/${gushanLedgerId}/settlement/transfers/${dingToBai.id}/remind`,
        headers: authHeaders(bai!, firstKey),
        payload: { note: '  方便时转一下鼓山门票  ' },
      }),
      endpoints.remindTransfer.response,
    ).data;
    expect(remind1Replay).toEqual(remind1);

    success(
      await fixture.app.inject({
        method: 'POST',
        url: `/api/v1/ledgers/${gushanLedgerId}/settlement/transfers/${chenToAn.id}/remind`,
        headers: authHeaders(an!, randomUUID()),
        payload: {},
      }),
      endpoints.remindTransfer.response,
    );

    success(
      await fixture.app.inject({
        method: 'POST',
        url: `/api/v1/ledgers/${secondLedger.ledgerId}/settlement/transfers/${secondLedger.transferId}/remind`,
        headers: authHeaders(an!, randomUUID()),
        payload: {},
      }),
      endpoints.remindTransfer.response,
    );

    await expireReminderCooldown(gushanLedgerId, dingToBai.id);
    success(
      await fixture.app.inject({
        method: 'POST',
        url: `/api/v1/ledgers/${gushanLedgerId}/settlement/transfers/${dingToBai.id}/remind`,
        headers: authHeaders(an!, randomUUID()),
        payload: { note: '创建者二次提醒' },
      }),
      endpoints.remindTransfer.response,
    );

    // 4. Cross-user isolation on A33: actors and stranger see 0; chen sees only chen's 1; ding sees 3.
    for (const emptyUser of [an!, bai!, stranger!]) {
      const inbox = success(
        await fixture.app.inject({
          url: '/api/v1/me/notifications',
          headers: authHeaders(emptyUser),
        }),
        endpoints.listNotifications.response,
      );
      expect(inbox).toEqual({ data: [], page: { nextCursor: null } });
    }

    const chenInbox = success(
      await fixture.app.inject({
        url: '/api/v1/me/notifications?unreadOnly=true',
        headers: authHeaders(chen!),
      }),
      endpoints.listNotifications.response,
    );
    expect(chenInbox.data).toHaveLength(1);
    expect(chenInbox.data[0]).toMatchObject({
      type: 'SETTLEMENT_REMINDER',
      ledgerId: gushanLedgerId,
      ledgerName: '鼓山一日',
      transferId: chenToAn.id,
      actorUserId: an!.user.id,
      actorName: '小安',
      amountCents: '3000',
      note: null,
      readAt: null,
    });

    // 5. Ding paginates across 3 real A32 reminders with limit=2 (zero duplicates/omissions).
    const page1 = success(
      await fixture.app.inject({
        url: '/api/v1/me/notifications?limit=2',
        headers: authHeaders(ding!),
      }),
      endpoints.listNotifications.response,
    );
    expect(page1.data).toHaveLength(2);
    expect(page1.page.nextCursor).toBeTruthy();

    const page2 = success(
      await fixture.app.inject({
        url: `/api/v1/me/notifications?limit=2&cursor=${encodeURIComponent(page1.page.nextCursor!)}`,
        headers: authHeaders(ding!),
      }),
      endpoints.listNotifications.response,
    );
    expect(page2.data).toHaveLength(1);
    expect(page2.page.nextCursor).toBeNull();

    const allDingItems = [...page1.data, ...page2.data];
    expect(new Set(allDingItems.map((i) => i.id)).size).toBe(3);
    expect(allDingItems.map((i) => ({ amountCents: i.amountCents, note: i.note }))).toEqual([
      { amountCents: '6000', note: '创建者二次提醒' },
      { amountCents: '4000', note: null },
      { amountCents: '6000', note: '方便时转一下鼓山门票' },
    ]);
    const baiNotification = allDingItems[2]!;
    expect(baiNotification).toMatchObject({
      ledgerId: gushanLedgerId,
      ledgerName: '鼓山一日',
      transferId: dingToBai.id,
      actorUserId: bai!.user.id,
      actorName: '小白',
      amountCents: '6000',
      note: '方便时转一下鼓山门票',
      readAt: null,
    });

    // 6. A28 actor rename reflects immediately on bai's notification without altering an's rows.
    success(
      await fixture.app.inject({
        method: 'PATCH',
        url: '/api/v1/me',
        headers: authHeaders(bai!),
        payload: { username: '小白改名版' },
      }),
      endpoints.updateProfile.response,
    );
    const afterRename = success(
      await fixture.app.inject({
        url: '/api/v1/me/notifications',
        headers: authHeaders(ding!),
      }),
      endpoints.listNotifications.response,
    ).data;
    expect(afterRename.find((i) => i.id === baiNotification.id)?.actorName).toBe('小白改名版');
    expect(
      afterRename.filter((i) => i.actorUserId === an!.user.id).every((i) => i.actorName === '小安'),
    ).toBe(true);

    // 7. A34 rejects non-recipients (actor, creator, fellow member, stranger) with 403 FORBIDDEN.
    for (const nonRecipient of [bai!, an!, chen!, stranger!]) {
      rejected(
        await fixture.app.inject({
          method: 'POST',
          url: `/api/v1/me/notifications/${baiNotification.id}/read`,
          headers: authHeaders(nonRecipient),
        }),
        403,
        'FORBIDDEN',
      );
    }

    // 8. Recipient marks read idempotently; unreadOnly=true excludes it while unreadOnly=false keeps it.
    const readOnce = success(
      await fixture.app.inject({
        method: 'POST',
        url: `/api/v1/me/notifications/${baiNotification.id}/read`,
        headers: authHeaders(ding!),
      }),
      endpoints.markNotificationRead.response,
    ).data;
    const readTwice = success(
      await fixture.app.inject({
        method: 'POST',
        url: `/api/v1/me/notifications/${baiNotification.id}/read`,
        headers: authHeaders(ding!),
      }),
      endpoints.markNotificationRead.response,
    ).data;
    expect(readTwice).toEqual(readOnce);

    const unreadPage1 = success(
      await fixture.app.inject({
        url: '/api/v1/me/notifications?unreadOnly=true&limit=1',
        headers: authHeaders(ding!),
      }),
      endpoints.listNotifications.response,
    );
    expect(unreadPage1.data).toHaveLength(1);
    expect(unreadPage1.page.nextCursor).toBeTruthy();

    const unreadPage2 = success(
      await fixture.app.inject({
        url: `/api/v1/me/notifications?unreadOnly=true&limit=1&cursor=${encodeURIComponent(unreadPage1.page.nextCursor!)}`,
        headers: authHeaders(ding!),
      }),
      endpoints.listNotifications.response,
    );
    expect(unreadPage2.data).toHaveLength(1);
    expect(unreadPage2.page.nextCursor).toBeNull();
    expect([...unreadPage1.data, ...unreadPage2.data].map((i) => i.id)).toEqual([
      allDingItems[0]!.id,
      allDingItems[1]!.id,
    ]);

    const fullAfterRead = success(
      await fixture.app.inject({
        url: '/api/v1/me/notifications?unreadOnly=false',
        headers: authHeaders(ding!),
      }),
      endpoints.listNotifications.response,
    ).data;
    expect(fullAfterRead).toHaveLength(3);
    expect(fullAfterRead.find((i) => i.id === baiNotification.id)?.readAt).toBe(readOnce.readAt);
  });

  it('silently skips A32 notification delivery when A29 notification_enabled=false and resumes after re-enabling', async () => {
    const owner = await fixture.register('静默收款人');
    const payer = await fixture.register('静默付款人');
    const seeded = await seedSettlingTransfer(owner, payer, '静默开关账本', '10000');

    // 1. Default enabled -> A32 delivers 1 unread notification.
    const firstRemind = success(
      await fixture.app.inject({
        method: 'POST',
        url: `/api/v1/ledgers/${seeded.ledgerId}/settlement/transfers/${seeded.transferId}/remind`,
        headers: authHeaders(owner, randomUUID()),
        payload: { note: '开启时催还' },
      }),
      endpoints.remindTransfer.response,
    ).data;
    expect(Object.keys(firstRemind).sort()).toEqual([
      'cooldownEndsAt',
      'ledgerId',
      'remindedAt',
      'transferId',
    ]);

    const initialUnread = success(
      await fixture.app.inject({
        url: '/api/v1/me/notifications?unreadOnly=true',
        headers: authHeaders(payer),
      }),
      endpoints.listNotifications.response,
    ).data;
    expect(initialUnread).toHaveLength(1);
    const firstNotificationId = initialUnread[0]!.id;

    // 2. Disable A29 notification_enabled -> A32 after cooldown returns 200 without leaking opt-out,
    //    still enforces 429 cooldown, and inserts zero new notification rows.
    success(
      await fixture.app.inject({
        method: 'PATCH',
        url: '/api/v1/me/preferences',
        headers: authHeaders(payer),
        payload: { notificationEnabled: false },
      }),
      endpoints.updatePreferences.response,
    );
    await expireReminderCooldown(seeded.ledgerId, seeded.transferId);

    const silentRemind = success(
      await fixture.app.inject({
        method: 'POST',
        url: `/api/v1/ledgers/${seeded.ledgerId}/settlement/transfers/${seeded.transferId}/remind`,
        headers: authHeaders(owner, randomUUID()),
        payload: { note: '关闭期间不应落库' },
      }),
      endpoints.remindTransfer.response,
    ).data;
    expect(Object.keys(silentRemind).sort()).toEqual([
      'cooldownEndsAt',
      'ledgerId',
      'remindedAt',
      'transferId',
    ]);

    rejected(
      await fixture.app.inject({
        method: 'POST',
        url: `/api/v1/ledgers/${seeded.ledgerId}/settlement/transfers/${seeded.transferId}/remind`,
        headers: authHeaders(owner, randomUUID()),
        payload: {},
      }),
      429,
      'REMINDER_COOLDOWN',
    );

    const stillOne = success(
      await fixture.app.inject({
        url: '/api/v1/me/notifications?unreadOnly=true',
        headers: authHeaders(payer),
      }),
      endpoints.listNotifications.response,
    ).data;
    expect(stillOne.map((i) => i.id)).toEqual([firstNotificationId]);

    // Pre-existing notification remains markable read while disabled.
    success(
      await fixture.app.inject({
        method: 'POST',
        url: `/api/v1/me/notifications/${firstNotificationId}/read`,
        headers: authHeaders(payer),
      }),
      endpoints.markNotificationRead.response,
    );
    expect(
      success(
        await fixture.app.inject({
          url: '/api/v1/me/notifications?unreadOnly=true',
          headers: authHeaders(payer),
        }),
        endpoints.listNotifications.response,
      ).data,
    ).toEqual([]);

    // 3. Re-enable A29 -> A32 after cooldown resumes inserting into payer's unread list.
    success(
      await fixture.app.inject({
        method: 'PATCH',
        url: '/api/v1/me/preferences',
        headers: authHeaders(payer),
        payload: { notificationEnabled: true },
      }),
      endpoints.updatePreferences.response,
    );
    await expireReminderCooldown(seeded.ledgerId, seeded.transferId);

    success(
      await fixture.app.inject({
        method: 'POST',
        url: `/api/v1/ledgers/${seeded.ledgerId}/settlement/transfers/${seeded.transferId}/remind`,
        headers: authHeaders(owner, randomUUID()),
        payload: { note: '恢复后新催还' },
      }),
      endpoints.remindTransfer.response,
    );

    const resumedUnread = success(
      await fixture.app.inject({
        url: '/api/v1/me/notifications?unreadOnly=true',
        headers: authHeaders(payer),
      }),
      endpoints.listNotifications.response,
    ).data;
    expect(resumedUnread).toHaveLength(1);
    expect(resumedUnread[0]).toMatchObject({
      ledgerId: seeded.ledgerId,
      transferId: seeded.transferId,
      actorUserId: owner.user.id,
      amountCents: '5000',
      note: '恢复后新催还',
      readAt: null,
    });
  });
});
