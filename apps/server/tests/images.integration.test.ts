import { createHash, randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { MAX_IMAGE_BYTES } from '@tongzhang/contracts';
import {
  expenseImages,
  expenseSplits,
  expenses,
  idempotencyKeys,
  imageAssets,
  ledgerMembers,
  ledgers,
  operationLogs,
} from '../src/db/schema/index.js';
import { createExpensesService } from '../src/modules/expenses/index.js';
import { receiptBinder } from '../src/modules/images/index.js';
import { integrationFixture } from './fixtures/integration.js';
import { imageBytes, imageMultipart } from './fixtures/images.js';

let fixture: Awaited<ReturnType<typeof integrationFixture>>;
beforeEach(async () => {
  fixture = await integrationFixture();
});
afterEach(async () => {
  await fixture.close();
});

const upload = (
  token: string,
  content: Buffer,
  mimeType = 'image/png',
  fields: [string, string][] = [['kind', 'RECEIPT']],
  fileFirst = false,
) => {
  const request = imageMultipart(content, mimeType, fields, fileFirst);
  return fixture.app.inject({
    method: 'POST',
    url: '/api/v1/images',
    payload: request.payload,
    headers: { ...request.headers, authorization: `Bearer ${token}` },
  });
};
const read = (token: string, id: string) =>
  fixture.app.inject({
    url: `/api/v1/images/${id}`,
    headers: { authorization: `Bearer ${token}` },
  });

async function seed() {
  const owner = await fixture.register('图片所有者');
  const member = await fixture.register('同账成员');
  const outsider = await fixture.register('其他用户');
  const ledgerId = await fixture.ledger(owner, [member]);
  const members = await fixture.db.orm
    .select()
    .from(ledgerMembers)
    .where(eq(ledgerMembers.ledgerId, ledgerId));
  const ownerMember = members.find((m) => m.userId === owner.user.id)!.id;
  const memberId = members.find((m) => m.userId === member.user.id)!.id;
  const body = {
    title: '含收据晚餐',
    amountCents: '12000',
    category: 'DINING' as const,
    occurredOn: '2026-10-25',
    payerMemberId: ownerMember,
    splitMode: 'EQUAL' as const,
    splits: [{ memberId: ownerMember }, { memberId }],
  };
  const create = (receiptImageId: string, key = randomUUID(), token = owner.accessToken) =>
    fixture.app.inject({
      method: 'POST',
      url: `/api/v1/ledgers/${ledgerId}/expenses`,
      headers: { authorization: `Bearer ${token}`, 'idempotency-key': key },
      payload: { ...body, receiptImageId },
    });
  return { owner, member, outsider, ledgerId, body, create };
}

async function assertNoExpense(ledgerId: string, userId: string) {
  expect(
    await fixture.db.orm.select().from(expenses).where(eq(expenses.ledgerId, ledgerId)),
  ).toHaveLength(0);
  expect(
    await fixture.db.orm.select().from(expenseSplits).where(eq(expenseSplits.ledgerId, ledgerId)),
  ).toHaveLength(0);
  expect(
    await fixture.db.orm.select().from(expenseImages).where(eq(expenseImages.ledgerId, ledgerId)),
  ).toHaveLength(0);
  expect(
    await fixture.db.orm.select().from(operationLogs).where(eq(operationLogs.ledgerId, ledgerId)),
  ).toHaveLength(0);
  expect(
    await fixture.db.orm.select().from(idempotencyKeys).where(eq(idempotencyKeys.userId, userId)),
  ).toHaveLength(0);
  const [ledger] = await fixture.db.orm.select().from(ledgers).where(eq(ledgers.id, ledgerId));
  expect(ledger!.version).toBe(1);
}

describe('real image HTTP and database lifecycle', () => {
  it.each(['jpeg', 'png'] as const)(
    'uploads real %s bytes to bytea and restricts unbound reads to uploader',
    async (format) => {
      const owner = await fixture.register();
      const outsider = await fixture.register();
      const content = await imageBytes(format);
      const response = await upload(
        owner.accessToken,
        content,
        `image/${format}`,
        [['kind', 'COVER']],
        true,
      );
      expect(response.statusCode).toBe(201);
      const data = response.json().data;
      expect(data).toMatchObject({
        mimeType: `image/${format}`,
        width: 4,
        height: 3,
        byteSize: content.length,
      });
      const [saved] = await fixture.db.orm
        .select()
        .from(imageAssets)
        .where(eq(imageAssets.id, data.imageId));
      expect(saved).toMatchObject({
        content,
        ledgerId: null,
        kind: 'COVER',
        uploadedByUserId: owner.user.id,
        sha256: createHash('sha256').update(content).digest('hex'),
      });
      const own = await read(owner.accessToken, data.imageId);
      expect(own.statusCode).toBe(200);
      expect(own.rawPayload).toEqual(content);
      expect(own.headers['content-type']).toBe(`image/${format}`);
      expect(own.headers['cache-control']).toBe('no-store');
      expect((await read(outsider.accessToken, data.imageId)).statusCode).toBe(403);
      expect((await read(owner.accessToken, randomUUID())).statusCode).toBe(403);
      expect((await fixture.app.inject(`/api/v1/images/${data.imageId}`)).statusCode).toBe(401);
    },
  );

  it('rejects malformed, spoofed, oversized and invalid multipart images without rows', async () => {
    const owner = await fixture.register();
    const png = await imageBytes();
    const corrupt = png.subarray(0, png.length - 30);
    for (const content of [
      Buffer.alloc(0),
      Buffer.from('fake PNG'),
      corrupt,
      await imageBytes('png', 4097, 1),
    ]) {
      expect((await upload(owner.accessToken, content)).statusCode).toBe(400);
    }
    expect((await upload(owner.accessToken, png, 'image/jpeg')).statusCode).toBe(400);
    expect((await upload(owner.accessToken, png, 'application/octet-stream')).statusCode).toBe(400);
    expect(
      (
        await upload(owner.accessToken, png, 'image/png', [
          ['kind', 'RECEIPT'],
          ['kind', 'COVER'],
        ])
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await upload(owner.accessToken, png, 'image/png', [
          ['kind', 'RECEIPT'],
          ['unexpected', 'field'],
        ])
      ).statusCode,
    ).toBe(400);
    expect((await upload(owner.accessToken, Buffer.alloc(MAX_IMAGE_BYTES + 1))).statusCode).toBe(
      413,
    );
    const noFile = imageMultipart(png);
    const boundary = 'tongzhang-image-test-boundary';
    expect(
      (
        await fixture.app.inject({
          method: 'POST',
          url: '/api/v1/images',
          headers: { ...noFile.headers, authorization: `Bearer ${owner.accessToken}` },
          payload: `--${boundary}\r\nContent-Disposition: form-data; name="kind"\r\n\r\nRECEIPT\r\n--${boundary}--\r\n`,
        })
      ).statusCode,
    ).toBe(400);
    expect(
      await fixture.db.orm
        .select()
        .from(imageAssets)
        .where(eq(imageAssets.uploadedByUserId, owner.user.id)),
    ).toHaveLength(0);
    const anonymous = imageMultipart(Buffer.alloc(MAX_IMAGE_BYTES + 1));
    expect(
      (await fixture.app.inject({ method: 'POST', url: '/api/v1/images', ...anonymous }))
        .statusCode,
    ).toBe(401);
  });

  it('accepts exactly 1 MiB over multipart and rejects larger payloads', async () => {
    const owner = await fixture.register();
    const jpeg = await imageBytes('jpeg');
    const exact = Buffer.concat([jpeg, Buffer.alloc(MAX_IMAGE_BYTES - jpeg.length)]);
    const result = await upload(owner.accessToken, exact, 'image/jpeg');
    expect(result.statusCode).toBe(201);
    expect(result.json().data.byteSize).toBe(MAX_IMAGE_BYTES);
  });

  it('checks the optional ledger scope but keeps uploads private until business save', async () => {
    const s = await seed();
    const bytes = await imageBytes();
    const fields: [string, string][] = [
      ['kind', 'RECEIPT'],
      ['ledgerId', s.ledgerId],
    ];
    expect((await upload(s.outsider.accessToken, bytes, 'image/png', fields)).statusCode).toBe(403);
    const uploaded = await upload(s.owner.accessToken, bytes, 'image/png', fields);
    expect(uploaded.statusCode).toBe(201);
    expect((await read(s.member.accessToken, uploaded.json().data.imageId)).statusCode).toBe(403);
    await fixture.db.orm
      .update(ledgers)
      .set({ status: 'SETTLING' })
      .where(eq(ledgers.id, s.ledgerId));
    expect((await upload(s.owner.accessToken, bytes, 'image/png', fields)).statusCode).toBe(409);
  });

  it('binds receipt, expense, splits, version, audit and replay result once in the same transaction', async () => {
    const s = await seed();
    const content = await imageBytes();
    const uploaded = await upload(s.owner.accessToken, content);
    const imageId = uploaded.json().data.imageId;
    const key = randomUUID();
    const created = await s.create(imageId, key);
    expect(created.statusCode).toBe(201);
    expect(created.json().data.splits.map((x: { amountCents: string }) => x.amountCents)).toEqual([
      '6000',
      '6000',
    ]);
    const replay = await s.create(imageId, key);
    expect(replay.statusCode).toBe(201);
    expect(replay.json()).toEqual(created.json());
    const id = created.json().data.id;
    const detail = await fixture.app.inject({
      url: `/api/v1/ledgers/${s.ledgerId}/expenses/${id}`,
      headers: { authorization: `Bearer ${s.member.accessToken}` },
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().data.receiptImageId).toBe(imageId);
    expect((await read(s.member.accessToken, imageId)).rawPayload).toEqual(content);
    expect((await read(s.outsider.accessToken, imageId)).statusCode).toBe(403);
    expect((await s.create(imageId)).statusCode).toBe(400);
    expect(
      await fixture.db.orm.select().from(expenses).where(eq(expenses.ledgerId, s.ledgerId)),
    ).toHaveLength(1);
    expect(
      await fixture.db.orm.select().from(expenseImages).where(eq(expenseImages.imageId, imageId)),
    ).toHaveLength(1);
    expect(
      await fixture.db.orm
        .select()
        .from(operationLogs)
        .where(eq(operationLogs.ledgerId, s.ledgerId)),
    ).toHaveLength(1);
    expect(
      await fixture.db.orm
        .select()
        .from(idempotencyKeys)
        .where(eq(idempotencyKeys.userId, s.owner.user.id)),
    ).toHaveLength(1);
    const [ledger] = await fixture.db.orm.select().from(ledgers).where(eq(ledgers.id, s.ledgerId));
    expect(ledger!.version).toBe(2);
  });

  it('rejects missing, other-user and cover assets without partial business data', async () => {
    const s = await seed();
    const bytes = await imageBytes();
    const foreign = (await upload(s.member.accessToken, bytes)).json().data.imageId;
    const cover = (
      await upload(s.owner.accessToken, bytes, 'image/png', [['kind', 'COVER']])
    ).json().data.imageId;
    expect((await s.create(randomUUID())).statusCode).toBe(403);
    expect((await s.create(foreign)).statusCode).toBe(403);
    expect((await s.create(cover)).statusCode).toBe(400);
    expect((await s.create(foreign, randomUUID(), s.outsider.accessToken)).statusCode).toBe(403);
    await assertNoExpense(s.ledgerId, s.owner.user.id);
    const images = await fixture.db.orm
      .select()
      .from(imageAssets)
      .where(inArray(imageAssets.id, [foreign, cover]));
    expect(images.every((x) => x.ledgerId === null)).toBe(true);
  });

  it('rolls back an already-bound image when a later step fails and allows an explicit retry', async () => {
    const s = await seed();
    const imageId = (await upload(s.owner.accessToken, await imageBytes())).json().data.imageId;
    const service = createExpensesService(fixture.db.orm, {
      bind: async (tx, input) => {
        await receiptBinder.bind(tx, input);
        throw new Error('injected failure after real receipt binding');
      },
    });
    const key = randomUUID();
    await expect(
      service.createExpense(
        {
          params: { ledgerId: s.ledgerId },
          query: {},
          body: { ...s.body, receiptImageId: imageId },
        },
        {
          principal: { userId: s.owner.user.id, sessionId: randomUUID() },
          requestId: randomUUID(),
          idempotencyKey: key,
        },
      ),
    ).rejects.toThrow('injected failure');
    await assertNoExpense(s.ledgerId, s.owner.user.id);
    const [image] = await fixture.db.orm
      .select()
      .from(imageAssets)
      .where(eq(imageAssets.id, imageId));
    expect(image!.ledgerId).toBeNull();
    expect((await read(s.member.accessToken, imageId)).statusCode).toBe(403);
    expect((await s.create(imageId, key)).statusCode).toBe(201);
  });

  it('rolls back receipt and version updates when the real audit insert fails', async () => {
    const s = await seed();
    const imageId = (await upload(s.owner.accessToken, await imageBytes())).json().data.imageId;
    const key = randomUUID();
    // Force a PostgreSQL UUID failure at appendAudit, after the real binding and version update.
    await expect(
      createExpensesService(fixture.db.orm).createExpense(
        {
          params: { ledgerId: s.ledgerId },
          query: {},
          body: { ...s.body, receiptImageId: imageId },
        },
        {
          principal: { userId: s.owner.user.id, sessionId: randomUUID() },
          requestId: 'invalid-audit-uuid',
          idempotencyKey: key,
        },
      ),
    ).rejects.toThrow();
    await assertNoExpense(s.ledgerId, s.owner.user.id);
    const [image] = await fixture.db.orm
      .select()
      .from(imageAssets)
      .where(eq(imageAssets.id, imageId));
    expect(image!.ledgerId).toBeNull();
    expect((await s.create(imageId, key)).statusCode).toBe(201);
  });

  it('serializes competing receipt bindings across different ledgers without moving the asset', async () => {
    const s = await seed();
    const otherLedger = await fixture.ledger(s.owner);
    const [otherMember] = await fixture.db.orm
      .select()
      .from(ledgerMembers)
      .where(eq(ledgerMembers.ledgerId, otherLedger));
    const imageId = (await upload(s.owner.accessToken, await imageBytes())).json().data.imageId;
    const results = await Promise.all([
      s.create(imageId),
      fixture.app.inject({
        method: 'POST',
        url: `/api/v1/ledgers/${otherLedger}/expenses`,
        headers: {
          authorization: `Bearer ${s.owner.accessToken}`,
          'idempotency-key': randomUUID(),
        },
        payload: {
          ...s.body,
          payerMemberId: otherMember!.id,
          splits: [{ memberId: otherMember!.id }],
          receiptImageId: imageId,
        },
      }),
    ]);
    expect(results.map((x) => x.statusCode).sort()).toEqual([201, 400]);
    expect(
      await fixture.db.orm
        .select()
        .from(expenses)
        .where(inArray(expenses.ledgerId, [s.ledgerId, otherLedger])),
    ).toHaveLength(1);
    expect(
      await fixture.db.orm.select().from(expenseImages).where(eq(expenseImages.imageId, imageId)),
    ).toHaveLength(1);
    const [image] = await fixture.db.orm
      .select()
      .from(imageAssets)
      .where(eq(imageAssets.id, imageId));
    const winner = results.find((x) => x.statusCode === 201)!.json().data;
    expect(image!.ledgerId).toBe(winner.ledgerId);
  });
});
