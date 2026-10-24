import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { errorResponseSchema, uuidSchema } from '@tongzhang/contracts';
import { executeIdempotent } from '../src/db/idempotency.js';
import { withTransaction } from '../src/db/transaction.js';
import { idempotencyKeys, ledgerMembers, ledgers, operationLogs } from '../src/db/schema/index.js';
import { AppError } from '../src/http/errors.js';
import { requireLedgerMember, requireActive } from '../src/modules/ledgers/index.js';
import { integrationFixture, type TestAccount } from './fixtures/integration.js';

let fixture: Awaited<ReturnType<typeof integrationFixture>>;
let owner: TestAccount;
let member: TestAccount;
let ledgerId: string;
const bodySchema = z.strictObject({ name: z.string().trim().min(1).max(40) });

beforeEach(async () => {
  fixture = await integrationFixture();
  // Test-only HTTP adapter: exercises production auth, access, transaction and replay helpers.
  // It is never registered in the application and is not a claim that ledger writes are shipped.
  fixture.app.post(
    '/__tests/ledgers/:ledgerId/name',
    {
      onRequest: async (request) => {
        request.principal = await fixture.app.authenticate(request);
      },
    },
    async (request, reply) => {
      const id = uuidSchema.parse((request.params as { ledgerId: string }).ledgerId);
      const body = bodySchema.parse(request.body);
      const userId = request.principal!.userId;
      const key = String(request.headers['idempotency-key'] ?? '');
      const result = await withTransaction(fixture.db.orm, async (tx) => {
        return executeIdempotent(
          tx,
          {
            userId,
            operation: `POST /__tests/ledgers/${id}/name`,
            key,
            request: body,
            responseStatus: 200,
            authorize: async () => {
              await requireLedgerMember(tx, id, userId);
            },
          },
          async () => {
            await tx
              .select({ id: ledgers.id })
              .from(ledgers)
              .where(eq(ledgers.id, id))
              .for('update');
            requireActive(await requireLedgerMember(tx, id, userId));
            const [updated] = await tx
              .update(ledgers)
              .set({ name: body.name, version: sql`${ledgers.version} + 1` })
              .where(eq(ledgers.id, id))
              .returning({ version: ledgers.version });
            const [audit] = await tx
              .insert(operationLogs)
              .values({
                actorUserId: userId,
                ledgerId: id,
                action: 'test.idempotency',
                targetType: 'ledger',
                targetId: id,
                requestId: request.id,
              })
              .returning({ id: operationLogs.id });
            if (request.headers['x-test-fail'] === 'true')
              throw new AppError('TEST_ROLLBACK', '测试事务回滚', 500);
            if (request.headers['x-test-invalid-result'] === 'true')
              return { data: { invalid: 1n } };
            return {
              data: {
                ledgerId: id,
                name: body.name,
                version: updated!.version,
                auditId: audit!.id,
              },
            };
          },
        );
      });
      return reply.code(result.statusCode).send(result.body);
    },
  );
  owner = await fixture.register();
  member = await fixture.register();
  ledgerId = await fixture.ledger(owner, [member]);
});
afterEach(async () => {
  await fixture.close();
});

function submit(
  key: string,
  name = '更新后的测试账本',
  account = owner,
  id = ledgerId,
  fail = false,
) {
  return fixture.app.inject({
    method: 'POST',
    url: `/__tests/ledgers/${id}/name`,
    headers: {
      authorization: `Bearer ${account.accessToken}`,
      'idempotency-key': key,
      ...(fail ? { 'x-test-fail': 'true' } : {}),
    },
    payload: { name },
  });
}
async function counts(id = ledgerId) {
  const [ledger] = await fixture.db.orm
    .select({ version: ledgers.version, name: ledgers.name })
    .from(ledgers)
    .where(eq(ledgers.id, id));
  const audit = await fixture.db.pool.query(
    'select count(*)::int as count from operation_logs where ledger_id=$1',
    [id],
  );
  const keys = await fixture.db.pool.query(
    'select count(*)::int as count from idempotency_keys where operation=$1',
    [`POST /__tests/ledgers/${id}/name`],
  );
  return { ...ledger, audits: audit.rows[0].count, keys: keys.rows[0].count };
}
describe('real PostgreSQL idempotency through an isolated HTTP adapter', () => {
  it('replays the exact success body without duplicating the ledger change or audit', async () => {
    const key = randomUUID();
    const first = await submit(key);
    const replay = await submit(key);
    expect(first.statusCode).toBe(200);
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toEqual(first.json());
    expect(first.json().data).toMatchObject({ ledgerId, name: '更新后的测试账本', version: 2 });
    expect(await counts()).toMatchObject({ version: 2, audits: 1, keys: 1 });
  });
  it('rejects the same key with different content using a contract error and no new effects', async () => {
    const key = randomUUID();
    await submit(key);
    const response = await submit(key, '另一份内容');
    expect(response.statusCode).toBe(409);
    expect(errorResponseSchema.parse(response.json()).error.code).toBe('IDEMPOTENCY_CONFLICT');
    expect(await counts()).toMatchObject({
      version: 2,
      name: '更新后的测试账本',
      audits: 1,
      keys: 1,
    });
  });
  it('serializes concurrent requests using differently cased UUIDs into one committed effect', async () => {
    const key = `aaaaaaaa-${randomUUID().slice(9)}`;
    const responses = await Promise.all(
      Array.from({ length: 4 }, (_, index) => submit(index % 2 ? key.toUpperCase() : key)),
    );
    expect(responses.map((r) => r.statusCode)).toEqual([200, 200, 200, 200]);
    for (const response of responses) expect(response.json()).toEqual(responses[0]!.json());
    expect(await counts()).toMatchObject({ version: 2, audits: 1, keys: 1 });
  });
  it('permits one winner for simultaneous conflicting content', async () => {
    const key = randomUUID();
    const responses = await Promise.all([submit(key, '名称甲'), submit(key, '名称乙')]);
    expect(responses.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    expect(await counts()).toMatchObject({ version: 2, audits: 1, keys: 1 });
  });
  it('rolls back the business row, audit and replay result together, then allows explicit retry', async () => {
    const key = randomUUID();
    const failed = await submit(key, '更新后的测试账本', owner, ledgerId, true);
    expect(failed.statusCode).toBe(500);
    expect(await counts()).toMatchObject({ version: 1, name: '隔离测试账本', audits: 0, keys: 0 });
    expect((await submit(key)).statusCode).toBe(200);
    expect(await counts()).toMatchObject({ version: 2, audits: 1, keys: 1 });
  });
  it('isolates the same key by user and normalized resource path', async () => {
    const key = randomUUID();
    const other = await fixture.ledger(owner);
    expect((await submit(key)).statusCode).toBe(200);
    expect((await submit(key, '成员提交', member)).statusCode).toBe(200);
    expect((await submit(key, '另一个账本', owner, other)).statusCode).toBe(200);
    expect(await counts()).toMatchObject({ version: 3, audits: 2, keys: 2 });
    expect(await counts(other)).toMatchObject({ version: 2, audits: 1, keys: 1 });
  });
  it('rolls back when the result is not JSON-safe instead of storing a broken success', async () => {
    const key = randomUUID();
    const response = await fixture.app.inject({
      method: 'POST',
      url: `/__tests/ledgers/${ledgerId}/name`,
      headers: {
        authorization: `Bearer ${owner.accessToken}`,
        'idempotency-key': key,
        'x-test-invalid-result': 'true',
      },
      payload: { name: '无法序列化的结果' },
    });
    expect(response.statusCode).toBe(500);
    expect(errorResponseSchema.parse(response.json()).error.code).toBe('INTERNAL_ERROR');
    expect(await counts()).toMatchObject({ version: 1, audits: 0, keys: 0 });
    expect((await submit(key)).statusCode).toBe(200);
  });
  it('checks current membership before replaying an existing success', async () => {
    const key = randomUUID();
    expect((await submit(key, '成员提交', member)).statusCode).toBe(200);
    await fixture.db.orm
      .delete(ledgerMembers)
      .where(and(eq(ledgerMembers.ledgerId, ledgerId), eq(ledgerMembers.userId, member.user.id)));
    const denied = await submit(key, '成员提交', member);
    expect(denied.statusCode).toBe(403);
    expect(errorResponseSchema.parse(denied.json()).error.code).toBe('FORBIDDEN');
    expect(await counts()).toMatchObject({ version: 2, audits: 1, keys: 1 });
  });
  it('replaces an expired replay record without extending active replay retention', async () => {
    const key = randomUUID();
    await submit(key);
    const [before] = await fixture.db.orm
      .select({ expiresAt: idempotencyKeys.expiresAt })
      .from(idempotencyKeys)
      .where(eq(idempotencyKeys.key, key));
    await submit(key);
    const [after] = await fixture.db.orm
      .select({ expiresAt: idempotencyKeys.expiresAt })
      .from(idempotencyKeys)
      .where(eq(idempotencyKeys.key, key));
    expect(after!.expiresAt).toEqual(before!.expiresAt);
    await fixture.db.pool.query(
      "update idempotency_keys set created_at=now()-interval '8 days',expires_at=now()-interval '1 day' where user_id=$1 and key=$2",
      [owner.user.id, key],
    );
    expect((await submit(key, '过期后显式提交')).statusCode).toBe(200);
    expect(await counts()).toMatchObject({ version: 3, audits: 2, keys: 1 });
  });
  it('rejects missing or malformed keys before creating effects', async () => {
    for (const key of ['', 'not-a-uuid']) expect((await submit(key)).statusCode).toBe(400);
    expect(await counts()).toMatchObject({ version: 1, audits: 0, keys: 0 });
  });
});
