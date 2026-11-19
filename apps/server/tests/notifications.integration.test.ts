import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { asc, eq } from 'drizzle-orm';
import type { z } from 'zod';
import { endpoints, errorResponseSchema } from '@tongzhang/contracts';
import { ledgerMembers, notifications, operationLogs } from '../src/db/schema/index.js';
import { deliverSettlementReminderNotification } from '../src/modules/profile/index.js';
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
