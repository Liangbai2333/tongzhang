import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { asc, eq } from 'drizzle-orm';
import type { z } from 'zod';
import { endpoints, errorResponseSchema, inviteCodeSchema } from '@tongzhang/contracts';
import { invitations, ledgerMembers, operationLogs, users } from '../src/db/schema/index.js';
import { INVITE_QR_PREFIX } from '../src/modules/invitations/issue.js';
import { createProfileService } from '../src/modules/profile/index.js';
import { integrationFixture, testPassword, type TestAccount } from './fixtures/integration.js';
import { waitForBlockedQueries } from './fixtures/locks.js';

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

function parseScannedQrCode(qrPayload: string) {
  expect(qrPayload.startsWith(INVITE_QR_PREFIX)).toBe(true);
  return inviteCodeSchema.parse(qrPayload.slice(INVITE_QR_PREFIX.length));
}

describe('profile A28/A29 persistence, audit and QR invitation compatibility (issue 86)', () => {
  it('updates 2..30 character usernames with audit logs, keeps email read-only, and propagates across ledgers', async () => {
    const alice = await fixture.register('初始安');
    const bob = await fixture.register('初始白');
    const [aliceBefore] = await fixture.db.orm
      .select()
      .from(users)
      .where(eq(users.id, alice.user.id));
    const [bobBefore] = await fixture.db.orm.select().from(users).where(eq(users.id, bob.user.id));

    const created = success(
      await fixture.app.inject({
        method: 'POST',
        url: '/api/v1/ledgers',
        headers: authHeaders(alice, randomUUID()),
        payload: { name: '资料联动账本', coverKey: 'mountain' },
      }),
      endpoints.createLedger.response,
      201,
    ).data;

    const minUpdated = success(
      await fixture.app.inject({
        method: 'PATCH',
        url: '/api/v1/me',
        headers: authHeaders(alice),
        payload: { username: '  小安  ' },
      }),
      endpoints.updateProfile.response,
    );
    expect(minUpdated.data).toEqual({
      id: alice.user.id,
      username: '小安',
      email: alice.user.email,
      notificationEnabled: true,
    });

    const thirtyChars = '许'.repeat(30);
    const maxUpdated = success(
      await fixture.app.inject({
        method: 'PATCH',
        url: '/api/v1/me',
        headers: authHeaders(alice),
        payload: { username: thirtyChars },
      }),
      endpoints.updateProfile.response,
    );
    expect(maxUpdated.data.username).toBe(thirtyChars);
    expect(maxUpdated).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(maxUpdated)).not.toContain('$argon2id$');

    const me = success(
      await fixture.app.inject({ url: '/api/v1/me', headers: authHeaders(alice) }),
      endpoints.getMe.response,
    );
    expect(me.data).toEqual(maxUpdated.data);

    // Ledger creatorName and member views reflect the updated username without bumping ledger version.
    const preview = success(
      await fixture.app.inject({
        method: 'POST',
        url: '/api/v1/invitations/preview',
        headers: authHeaders(bob),
        payload: { code: created.invitation.code },
      }),
      endpoints.previewJoin.response,
    ).data;
    expect(preview.creatorName).toBe(thirtyChars);

    const detail = success(
      await fixture.app.inject({
        url: `/api/v1/ledgers/${created.ledger.id}`,
        headers: authHeaders(alice),
      }),
      endpoints.getLedger.response,
    ).data;
    expect(detail.version).toBe(1);
    expect(detail.members[0]?.username).toBe(thirtyChars);

    // Old username can no longer log in; new username and original read-only email both work.
    const oldNameLogin = await fixture.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { account: '初始安', password: testPassword },
    });
    rejected(oldNameLogin, 401, 'INVALID_CREDENTIALS');

    const newNameLogin = await fixture.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { account: thirtyChars, password: testPassword },
    });
    expect(newNameLogin.statusCode).toBe(200);

    const [aliceAfter] = await fixture.db.orm
      .select()
      .from(users)
      .where(eq(users.id, alice.user.id));
    const [bobAfter] = await fixture.db.orm.select().from(users).where(eq(users.id, bob.user.id));
    expect(aliceAfter?.email).toBe(aliceBefore!.email);
    expect(aliceAfter?.passwordHash).toBe(aliceBefore!.passwordHash);
    expect(bobAfter).toEqual(bobBefore);

    const audits = await fixture.db.orm
      .select()
      .from(operationLogs)
      .where(eq(operationLogs.actorUserId, alice.user.id))
      .orderBy(asc(operationLogs.createdAt));
    const profileAudits = audits.filter((row) => row.action === 'PROFILE_UPDATED');
    expect(profileAudits).toHaveLength(2);
    expect(profileAudits[0]).toMatchObject({
      actorUserId: alice.user.id,
      ledgerId: null,
      action: 'PROFILE_UPDATED',
      targetType: 'USER',
      targetId: alice.user.id,
      details: { previousUsername: '初始安', username: '小安' },
    });
    expect(profileAudits[1]).toMatchObject({
      actorUserId: alice.user.id,
      ledgerId: null,
      action: 'PROFILE_UPDATED',
      targetType: 'USER',
      targetId: alice.user.id,
      details: { previousUsername: '小安', username: thirtyChars },
    });
  });

  it('rejects out-of-range usernames, read-only email writes, extra fields and rolls back if audit fails', async () => {
    const alice = await fixture.register('边界用户');
    const bob = await fixture.register('旁观用户');

    const invalidPayloads: unknown[] = [
      {},
      { username: '' },
      { username: 'a' },
      { username: '   a   ' },
      { username: '   ' },
      { username: '😀' },
      { username: '超'.repeat(31) },
      { username: '合法名字', email: 'tampered@example.test' },
      { username: '合法名字', id: bob.user.id },
      { username: '合法名字', userId: bob.user.id },
      { username: '合法名字', notificationEnabled: false },
    ];

    for (const payload of invalidPayloads) {
      const response = await fixture.app.inject({
        method: 'PATCH',
        url: '/api/v1/me',
        headers: authHeaders(alice),
        payload: payload as Record<string, unknown>,
      });
      rejected(response, 400, 'VALIDATION_ERROR');
    }

    // Force an audit insert failure via invalid requestId UUID to verify user update + audit share one tx.
    const service = createProfileService(fixture.db.orm);
    await expect(
      service.updateProfile(
        { params: {}, query: {}, body: { username: '回滚名字' } },
        {
          requestId: 'not-a-valid-uuid',
          principal: { userId: alice.user.id, sessionId: randomUUID() },
          idempotencyKey: undefined,
        },
      ),
    ).rejects.toThrow();

    const [row] = await fixture.db.orm.select().from(users).where(eq(users.id, alice.user.id));
    expect(row?.username).toBe('边界用户');
    expect(row?.email).toBe(alice.user.email);
    const audits = await fixture.db.orm
      .select()
      .from(operationLogs)
      .where(eq(operationLogs.actorUserId, alice.user.id));
    expect(audits).toHaveLength(0);
  });

  it('persists absolute notification_enabled values in A29 without toggling or affecting other users', async () => {
    const alice = await fixture.register('通知甲');
    const bob = await fixture.register('通知乙');

    expect(
      success(
        await fixture.app.inject({ url: '/api/v1/me', headers: authHeaders(alice) }),
        endpoints.getMe.response,
      ).data.notificationEnabled,
    ).toBe(true);

    // Repeating false twice keeps notification_enabled = false (absolute assignment, never toggle).
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const disabled = success(
        await fixture.app.inject({
          method: 'PATCH',
          url: '/api/v1/me/preferences',
          headers: authHeaders(alice),
          payload: { notificationEnabled: false },
        }),
        endpoints.updatePreferences.response,
      );
      expect(disabled).toEqual({ data: { notificationEnabled: false } });
    }

    const [aliceDisabled] = await fixture.db.orm
      .select()
      .from(users)
      .where(eq(users.id, alice.user.id));
    const [bobUnchanged] = await fixture.db.orm
      .select()
      .from(users)
      .where(eq(users.id, bob.user.id));
    expect(aliceDisabled?.notificationEnabled).toBe(false);
    expect(aliceDisabled?.email).toBe(alice.user.email);
    expect(aliceDisabled?.username).toBe('通知甲');
    expect(bobUnchanged?.notificationEnabled).toBe(true);

    expect(
      success(
        await fixture.app.inject({ url: '/api/v1/me', headers: authHeaders(alice) }),
        endpoints.getMe.response,
      ).data.notificationEnabled,
    ).toBe(false);

    const reenabled = success(
      await fixture.app.inject({
        method: 'PATCH',
        url: '/api/v1/me/preferences',
        headers: authHeaders(alice),
        payload: { notificationEnabled: true },
      }),
      endpoints.updatePreferences.response,
    );
    expect(reenabled).toEqual({ data: { notificationEnabled: true } });

    for (const badPayload of [
      {},
      { notificationEnabled: 'false' },
      { notificationEnabled: 0 },
      { notificationEnabled: null },
      { notificationEnabled: false, email: 'hack@example.test' },
      { notificationEnabled: false, userId: bob.user.id },
    ]) {
      const response = await fixture.app.inject({
        method: 'PATCH',
        url: '/api/v1/me/preferences',
        headers: authHeaders(alice),
        payload: badPayload as Record<string, unknown>,
      });
      rejected(response, 400, 'VALIDATION_ERROR');
    }

    const audits = await fixture.db.orm
      .select()
      .from(operationLogs)
      .where(eq(operationLogs.actorUserId, alice.user.id))
      .orderBy(asc(operationLogs.createdAt));
    expect(audits.map((row) => [row.action, row.details])).toEqual([
      ['PREFERENCES_UPDATED', { previousNotificationEnabled: true, notificationEnabled: false }],
      ['PREFERENCES_UPDATED', { previousNotificationEnabled: false, notificationEnabled: false }],
      ['PREFERENCES_UPDATED', { previousNotificationEnabled: false, notificationEnabled: true }],
    ]);
  });

  it('rejects anonymous, malformed and revoked sessions on A28 and A29 with 401 UNAUTHENTICATED', async () => {
    const account = await fixture.register('会话核验');
    expect(
      (
        await fixture.app.inject({
          method: 'POST',
          url: '/api/v1/auth/logout',
          headers: authHeaders(account),
        })
      ).statusCode,
    ).toBe(200);

    for (const authorization of [
      undefined,
      'Bearer malformed-token',
      `Bearer ${account.accessToken}`,
    ]) {
      const headers = authorization ? { authorization } : {};
      rejected(
        await fixture.app.inject({
          method: 'PATCH',
          url: '/api/v1/me',
          headers,
          payload: { username: '被拒改名' },
        }),
        401,
        'UNAUTHENTICATED',
      );
      rejected(
        await fixture.app.inject({
          method: 'PATCH',
          url: '/api/v1/me/preferences',
          headers,
          payload: { notificationEnabled: false },
        }),
        401,
        'UNAUTHENTICATED',
      );
    }

    const [row] = await fixture.db.orm.select().from(users).where(eq(users.id, account.user.id));
    expect(row?.username).toBe('会话核验');
    expect(row?.notificationEnabled).toBe(true);
  });

  it('verifies QR-scanned 6-char codes against A11/A12 7-day TTL, reset revocation and 12-member row lock', async () => {
    const owner = await fixture.register('扫码创建者');
    const memberOne = await fixture.register('扫码成员一');
    const racerA = await fixture.register('扫码并发甲');
    const racerB = await fixture.register('扫码并发乙');

    const { ledger, invitation: initialInvitation } = success(
      await fixture.app.inject({
        method: 'POST',
        url: '/api/v1/ledgers',
        headers: authHeaders(owner, randomUUID()),
        payload: { name: '扫码兼容性核验', coverKey: 'city' },
      }),
      endpoints.createLedger.response,
      201,
    ).data;

    const firstScannedCode = parseScannedQrCode(initialInvitation.qrPayload);

    // Resetting the invitation revokes the old QR payload and issues a fresh 7-day QR payload.
    const reset = success(
      await fixture.app.inject({
        method: 'POST',
        url: `/api/v1/ledgers/${ledger.id}/invitation/reset`,
        headers: authHeaders(owner, randomUUID()),
      }),
      endpoints.resetInvitation.response,
    ).data;
    const activeScannedCode = parseScannedQrCode(reset.qrPayload);

    rejected(
      await fixture.app.inject({
        method: 'POST',
        url: '/api/v1/invitations/preview',
        headers: authHeaders(memberOne),
        payload: { code: firstScannedCode },
      }),
      400,
      'INVITE_INVALID',
    );

    // Member 1 joins via scanned active code.
    expect(
      success(
        await fixture.app.inject({
          method: 'POST',
          url: '/api/v1/invitations/join',
          headers: authHeaders(memberOne, randomUUID()),
          payload: { code: activeScannedCode },
        }),
        endpoints.joinLedger.response,
      ).data,
    ).toMatchObject({ ledgerId: ledger.id, alreadyMember: false });

    // Expire past 7-day TTL: non-members get 409 INVITE_EXPIRED on both A11 and A12, existing member still previews.
    await fixture.db.orm
      .update(invitations)
      .set({
        createdAt: new Date(Date.now() - 8 * 86_400_000),
        expiresAt: new Date(Date.now() - 60_000),
      })
      .where(eq(invitations.id, reset.id));

    rejected(
      await fixture.app.inject({
        method: 'POST',
        url: '/api/v1/invitations/preview',
        headers: authHeaders(racerA),
        payload: { code: activeScannedCode },
      }),
      409,
      'INVITE_EXPIRED',
    );
    rejected(
      await fixture.app.inject({
        method: 'POST',
        url: '/api/v1/invitations/join',
        headers: authHeaders(racerA, randomUUID()),
        payload: { code: activeScannedCode },
      }),
      409,
      'INVITE_EXPIRED',
    );
    expect(
      success(
        await fixture.app.inject({
          method: 'POST',
          url: '/api/v1/invitations/preview',
          headers: authHeaders(memberOne),
          payload: { code: activeScannedCode },
        }),
        endpoints.previewJoin.response,
      ).data,
    ).toMatchObject({ alreadyMember: true, canJoin: false });

    // Restore valid 7-day window and fill seats to 11/12, then race two scanned joins on the 12th seat.
    await fixture.db.orm
      .update(invitations)
      .set({ expiresAt: new Date(reset.expiresAt) })
      .where(eq(invitations.id, reset.id));
    const seededUsers = await Promise.all(
      Array.from({ length: 9 }, (_, index) => fixture.seedUser(`席位成员${index + 1}`)),
    );
    await fixture.db.orm
      .insert(ledgerMembers)
      .values(seededUsers.map((userId) => ({ ledgerId: ledger.id, userId })));

    const blocker = await fixture.db.pool.connect();
    const pending: Promise<Response>[] = [];
    try {
      await blocker.query('begin');
      const pid = await blocker.query<{ pid: number }>('select pg_backend_pid() as pid');
      await blocker.query('select id from ledgers where id=$1 for update', [ledger.id]);

      for (const account of [racerA, racerB]) {
        pending.push(
          fixture.app
            .inject({
              method: 'POST',
              url: '/api/v1/invitations/join',
              headers: authHeaders(account, randomUUID()),
              payload: { code: activeScannedCode },
            })
            .then((response) => response),
        );
      }
      await waitForBlockedQueries(fixture.db.pool, pid.rows[0]!.pid, 2);
      await blocker.query('commit');

      const responses = await Promise.all(pending);
      expect(responses.map((r) => r.statusCode).sort()).toEqual([200, 409]);
      for (const response of responses) {
        if (response.statusCode === 200) success(response, endpoints.joinLedger.response);
        else rejected(response, 409, 'MEMBER_LIMIT_REACHED');
      }

      const finalMembers = await fixture.db.orm
        .select()
        .from(ledgerMembers)
        .where(eq(ledgerMembers.ledgerId, ledger.id));
      expect(finalMembers).toHaveLength(12);
    } finally {
      try {
        await blocker.query('rollback');
      } finally {
        blocker.release();
        await Promise.allSettled(pending);
      }
    }
  });
});
