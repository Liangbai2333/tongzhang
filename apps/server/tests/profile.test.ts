import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  errorResponseSchema,
  inviteCodeSchema,
  notificationReadResultSchema,
  notificationSchema,
  userSelfSchema,
} from '@tongzhang/contracts';
import { buildApp } from '../src/app.js';
import { readEnv } from '../src/config/env.js';
import type { Orm } from '../src/db/transaction.js';
import { encodeCursor } from '../src/http/cursor.js';
import {
  generateInviteCode,
  INVITATION_TTL_MS,
  INVITE_QR_PREFIX,
  toInvitationDto,
} from '../src/modules/invitations/issue.js';
import {
  createProfileService,
  toNotificationItem,
  toNotificationReadResult,
  toUserSelf,
} from '../src/modules/profile/index.js';

const env = readEnv({
  NODE_ENV: 'test',
  PGHOST: '127.0.0.1',
  PGPORT: '1',
  AUTH_JWT_SECRET: 'cd'.repeat(32),
  PGUSER: 'test',
  PGPASSWORD: 'test',
  PGDATABASE: 'test',
  LOG_LEVEL: 'silent',
});

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('profile and invitation QR contract guards without PostgreSQL', () => {
  it('rejects unauthenticated access to A04, A28, A29, A33 and A34 with 401 UNAUTHENTICATED', async () => {
    const app = await buildApp(env);
    apps.push(app);
    const requests = [
      { method: 'GET' as const, url: '/api/v1/me' },
      { method: 'PATCH' as const, url: '/api/v1/me', payload: { username: '许雅欣' } },
      {
        method: 'PATCH' as const,
        url: '/api/v1/me/preferences',
        payload: { notificationEnabled: false },
      },
      { method: 'GET' as const, url: '/api/v1/me/notifications' },
      { method: 'POST' as const, url: `/api/v1/me/notifications/${randomUUID()}/read` },
    ];
    for (const request of requests) {
      const response = await app.inject(request);
      expect(response.statusCode).toBe(401);
      const parsed = errorResponseSchema.parse(response.json());
      expect(response.json()).toEqual(parsed);
      expect(parsed.error.code).toBe('UNAUTHENTICATED');
    }
  });

  it('maps UserSelf strictly without exposing passwordHash or timestamps', () => {
    const now = new Date('2026-11-16T08:00:00.000Z');
    const dto = toUserSelf({
      id: randomUUID(),
      username: '小安',
      email: 'an@example.test',
      passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$secret$hash',
      notificationEnabled: false,
      createdAt: now,
      updatedAt: now,
    });
    expect(userSelfSchema.parse(dto)).toEqual(dto);
    expect(dto).not.toHaveProperty('passwordHash');
    expect(dto).not.toHaveProperty('createdAt');
    expect(dto).not.toHaveProperty('updatedAt');
  });

  it('rejects single-codepoint astral characters and NUL bytes before hitting PostgreSQL', async () => {
    const service = createProfileService({} as Orm);
    const context = {
      requestId: randomUUID(),
      principal: { userId: randomUUID(), sessionId: randomUUID() },
      idempotencyKey: undefined,
    };
    await expect(
      service.updateProfile({ params: {}, query: {}, body: { username: '😀' } }, context),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
    });
    await expect(
      service.updateProfile({ params: {}, query: {}, body: { username: 'a\0b' } }, context),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
    });
  });

  it('formats 7-day invitation QR payloads compatible with A11/A12 6-character code schema', () => {
    expect(INVITATION_TTL_MS).toBe(7 * 86_400_000);
    for (let index = 0; index < 32; index += 1) {
      const code = generateInviteCode();
      expect(inviteCodeSchema.parse(code)).toBe(code);
      const createdAt = new Date('2026-11-16T00:00:00.000Z');
      const expiresAt = new Date(createdAt.getTime() + INVITATION_TTL_MS);
      const dto = toInvitationDto({ id: randomUUID(), code, expiresAt }, createdAt);
      expect(dto.expired).toBe(false);
      expect(dto.qrPayload).toBe(`${INVITE_QR_PREFIX}${code}`);
      const extracted = dto.qrPayload.slice(INVITE_QR_PREFIX.length);
      expect(inviteCodeSchema.parse(extracted)).toBe(code);
      expect(toInvitationDto({ id: randomUUID(), code, expiresAt }, expiresAt).expired).toBe(true);
    }
  });

  it('maps NotificationItem and NotificationReadResult strictly without exposing recipientUserId', () => {
    const createdAt = new Date('2026-11-18T10:00:00.000Z');
    const readAt = new Date('2026-11-18T10:05:00.000Z');
    const row = {
      id: randomUUID(),
      recipientUserId: randomUUID(),
      actorUserId: randomUUID(),
      type: 'SETTLEMENT_REMINDER',
      ledgerId: randomUUID(),
      transferId: randomUUID(),
      amountCents: 6000n,
      note: '方便时转一下鼓山门票钱',
      readAt: null as Date | null,
      createdAt,
    };
    const unreadDto = toNotificationItem({
      notification: row,
      ledgerName: '鼓山一日',
      actorName: '小白',
    });
    expect(notificationSchema.parse(unreadDto)).toEqual(unreadDto);
    expect(unreadDto).not.toHaveProperty('recipientUserId');
    expect(unreadDto.amountCents).toBe('6000');
    expect(unreadDto.readAt).toBeNull();

    const readDto = toNotificationReadResult({ ...row, readAt });
    expect(notificationReadResultSchema.parse(readDto)).toEqual({
      notificationId: row.id,
      readAt: readAt.toISOString(),
    });
  });

  it('rejects malformed or impossible notification pagination cursors before hitting PostgreSQL', async () => {
    const service = createProfileService({} as Orm);
    const context = {
      requestId: randomUUID(),
      principal: { userId: randomUUID(), sessionId: randomUUID() },
      idempotencyKey: undefined,
    };
    const invalidCursors = [
      'not-base64url!',
      encodeCursor(['2026-02-30T00:00:00.000000Z', randomUUID()]),
      encodeCursor(['0000-01-01T00:00:00.000000Z', randomUUID()]),
      encodeCursor(['2026-11-18T10:00:00.000000Z', 'not-a-uuid']),
    ];
    for (const cursor of invalidCursors) {
      await expect(
        service.listNotifications(
          { params: {}, query: { limit: 20, unreadOnly: false, cursor }, body: undefined },
          context,
        ),
      ).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
      });
    }
  });
});
