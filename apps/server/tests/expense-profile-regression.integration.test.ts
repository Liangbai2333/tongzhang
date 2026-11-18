import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { asc, eq } from 'drizzle-orm';
import type { z } from 'zod';
import { endpoints, errorResponseSchema } from '@tongzhang/contracts';
import {
  idempotencyKeys,
  ledgers,
  operationLogs,
  settlementBatches,
  users,
} from '../src/db/schema/index.js';
import { integrationFixture, type TestAccount } from './fixtures/integration.js';
import {
  createExpense,
  deleteExpenseRequest,
  expenseBody,
  raceExpenseWrites,
  readExpenseRow,
  seedMultiMemberLedger,
  updateExpenseRequest,
  type SeededLedger,
  type SeededMember,
} from './fixtures/expenses.js';
import { waitForBlockedQueries } from './fixtures/locks.js';

type Response = { statusCode: number; json: () => unknown };
let fixture: Awaited<ReturnType<typeof integrationFixture>>;

beforeEach(async () => {
  fixture = await integrationFixture();
});

afterEach(async () => {
  await fixture.close();
});

function parseOk<T>(res: Response, schema: z.ZodType<T>, status = 200): T {
  expect(res.statusCode).toBe(status);
  return schema.parse(res.json());
}

function expectErr(res: Response, status: number, code: string) {
  expect(res.statusCode).toBe(status);
  expect(errorResponseSchema.parse(res.json()).error.code).toBe(code);
}

const bearer = (member: SeededMember | TestAccount, key?: string) => ({
  authorization: `Bearer ${'account' in member ? member.account.accessToken : member.accessToken}`,
  ...(key === undefined ? {} : { 'idempotency-key': key }),
});

const renameMe = async (actor: SeededMember | TestAccount, username: string) =>
  parseOk(
    await fixture.app.inject({
      method: 'PATCH',
      url: '/api/v1/me',
      headers: bearer(actor),
      payload: { username },
    }),
    endpoints.updateProfile.response,
  ).data;

const setNotificationPref = async (
  actor: SeededMember | TestAccount,
  notificationEnabled: boolean,
) =>
  parseOk(
    await fixture.app.inject({
      method: 'PATCH',
      url: '/api/v1/me/preferences',
      headers: bearer(actor),
      payload: { notificationEnabled },
    }),
    endpoints.updatePreferences.response,
  ).data;

async function assertLedgerReadConservation(
  ledger: SeededLedger,
  viewer: SeededMember,
  expectedTotalCents: string,
) {
  const list = parseOk(
    await fixture.app.inject({ url: '/api/v1/ledgers', headers: bearer(viewer) }),
    endpoints.listLedgers.response,
  ).data;
  const summary = list.find((item) => item.id === ledger.ledgerId)!;
  const detail = parseOk(
    await fixture.app.inject({
      url: `/api/v1/ledgers/${ledger.ledgerId}`,
      headers: bearer(viewer),
    }),
    endpoints.getLedger.response,
  ).data;
  const members = parseOk(
    await fixture.app.inject({
      url: `/api/v1/ledgers/${ledger.ledgerId}/members`,
      headers: bearer(viewer),
    }),
    endpoints.listMembers.response,
  ).data;
  const balances = parseOk(
    await fixture.app.inject({
      url: `/api/v1/ledgers/${ledger.ledgerId}/balances`,
      headers: bearer(viewer),
    }),
    endpoints.getBalances.response,
  ).data;
  const stats = parseOk(
    await fixture.app.inject({
      url: `/api/v1/ledgers/${ledger.ledgerId}/statistics`,
      headers: bearer(viewer),
    }),
    endpoints.getStatistics.response,
  ).data;

  expect([
    summary.expenseTotalCents,
    detail.expenseTotalCents,
    balances.expenseTotalCents,
    stats.expenseTotalCents,
  ]).toEqual([expectedTotalCents, expectedTotalCents, expectedTotalCents, expectedTotalCents]);
  expect(summary.myRemainingNetCents).toBe(detail.myRemainingNetCents);
  expect(detail.members).toEqual(members);
  expect(
    Object.fromEntries(members.map((m) => [m.id, [m.username, m.netCents, m.remainingNetCents]])),
  ).toEqual(
    Object.fromEntries(
      balances.members.map((m) => [m.memberId, [m.username, m.netCents, m.remainingNetCents]]),
    ),
  );
  expect(stats.members).toEqual(
    balances.members.map(({ remainingNetCents: _remaining, ...rest }) => rest),
  );
  expect(balances.members.reduce((sum, m) => sum + BigInt(m.netCents), 0n)).toBe(0n);
  expect(balances.members.reduce((sum, m) => sum + BigInt(m.remainingNetCents), 0n)).toBe(0n);
  return { summary, detail, members, balances, stats };
}

async function seedGushanViaEditAndDelete(ledger: SeededLedger) {
  const { 小安: an, 小白: bai, 小陈: chen, 小丁: ding } = ledger.byName;
  const canteen = await createExpense(fixture, ledger, chen!, {
    title: '食堂初稿',
    amountCents: '10000',
    category: 'DINING',
    occurredOn: '2026-11-16',
    payer: an!,
  });
  await createExpense(fixture, ledger, bai!, {
    title: '门票',
    amountCents: '12000',
    category: 'TICKET',
    occurredOn: '2026-11-16',
    payer: bai!,
  });
  await createExpense(fixture, ledger, chen!, {
    title: '车费',
    amountCents: '6000',
    category: 'TRANSPORT',
    occurredOn: '2026-11-17',
    payer: chen!,
    splitWith: [an!, chen!],
  });
  const mistake = await createExpense(fixture, ledger, ding!, {
    title: '误记饮料',
    amountCents: '4000',
    category: 'SHOPPING',
    occurredOn: '2026-11-17',
    payer: ding!,
  });
  parseOk(
    await updateExpenseRequest(fixture, ledger)(
      chen!,
      canteen.id,
      expenseBody(ledger, { title: '食堂', amountCents: '12000', payer: an! }, 1),
    ),
    endpoints.updateExpense.response,
  );
  parseOk(
    await deleteExpenseRequest(fixture, ledger)(an!, mistake.id, 1),
    endpoints.deleteExpense.response,
  );
  return canteen.id;
}

async function assertExpenseFiltersAndCanEdit(ledger: SeededLedger, expenseId: string) {
  const { 小安: an, 小白: bai, 小陈: chen, 小丁: ding } = ledger.byName;
  for (const staleQuery of [
    'category=DINING',
    `payerMemberId=${an!.memberId}`,
    'from=2026-11-15&to=2026-11-15',
  ]) {
    const res = await fixture.app.inject({
      url: `/api/v1/ledgers/${ledger.ledgerId}/expenses?${staleQuery}`,
      headers: bearer(ding!),
    });
    expect(parseOk(res, endpoints.listExpenses.response).data).toEqual([]);
  }
  const filtered = parseOk(
    await fixture.app.inject({
      url: `/api/v1/ledgers/${ledger.ledgerId}/expenses?category=LODGING&payerMemberId=${bai!.memberId}&from=2026-11-18&to=2026-11-18`,
      headers: bearer(ding!),
    }),
    endpoints.listExpenses.response,
  ).data;
  expect(filtered.map((e) => [e.id, e.amountCents, e.version, e.payerName])).toEqual([
    [expenseId, '10001', 2, '小白'],
  ]);
  for (const [viewer, expectedCanEdit] of [
    [an!, true],
    [chen!, true],
    [bai!, false],
    [ding!, false],
  ] as const) {
    const detail = parseOk(
      await fixture.app.inject({
        url: `/api/v1/ledgers/${ledger.ledgerId}/expenses/${expenseId}`,
        headers: bearer(viewer),
      }),
      endpoints.getExpense.response,
    ).data;
    expect(detail.canEdit).toBe(expectedCanEdit);
  }
}

async function completeAllTransfersAndSettle(
  ledger: SeededLedger,
  creator: SeededMember,
  archiver: SeededMember,
) {
  const settlement = parseOk(
    await fixture.app.inject({
      url: `/api/v1/ledgers/${ledger.ledgerId}/settlement`,
      headers: bearer(creator),
    }),
    endpoints.getSettlement.response,
  ).data;
  expect(settlement).toMatchObject({ expenseTotalCents: '30000', transferTotalCents: '9000' });
  for (const transfer of settlement.transfers) {
    parseOk(
      await fixture.app.inject({
        method: 'POST',
        url: `/api/v1/ledgers/${ledger.ledgerId}/settlement/transfers/${transfer.id}/paid`,
        headers: bearer(creator, randomUUID()),
        payload: {},
      }),
      endpoints.markTransferPaid.response,
    );
  }
  parseOk(
    await fixture.app.inject({
      method: 'POST',
      url: `/api/v1/ledgers/${ledger.ledgerId}/settle`,
      headers: bearer(creator, randomUUID()),
    }),
    endpoints.settleLedger.response,
  );
  parseOk(
    await fixture.app.inject({
      method: 'POST',
      url: `/api/v1/ledgers/${ledger.ledgerId}/archive`,
      headers: bearer(archiver, randomUUID()),
    }),
    endpoints.archiveLedger.response,
  );
}

describe('B15 Day 2 isolated-DB regressions for A16/A17 and A28/A29 (issue 109)', () => {
  it('rejects sequential stale versions and syncs A14 filters, keyset cursor and all read views', async () => {
    const ledger = await seedMultiMemberLedger(fixture);
    const { 小安: an, 小白: bai, 小陈: chen, 小丁: ding } = ledger.byName;
    const patch = updateExpenseRequest(fixture, ledger);
    const del = deleteExpenseRequest(fixture, ledger);

    const lodge = await createExpense(fixture, ledger, chen!, {
      title: '食堂暂记',
      amountCents: '10000',
      category: 'DINING',
      occurredOn: '2026-11-15',
      payer: an!,
    });
    const ticket = await createExpense(fixture, ledger, bai!, {
      title: '门票',
      amountCents: '12000',
      category: 'TICKET',
      occurredOn: '2026-11-16',
      payer: bai!,
    });
    const taxi = await createExpense(fixture, ledger, chen!, {
      title: '车费',
      amountCents: '6000',
      category: 'TRANSPORT',
      occurredOn: '2026-11-16',
      payer: chen!,
      splitWith: [an!, chen!],
    });
    const previewBefore = parseOk(
      await fixture.app.inject({
        url: `/api/v1/ledgers/${ledger.ledgerId}/settlement-preview`,
        headers: bearer(an!),
      }),
      endpoints.previewSettlement.response,
    ).data;

    const updated = parseOk(
      await patch(chen!, lodge.id, {
        title: '山顶客栈',
        amountCents: '10001',
        category: 'LODGING',
        occurredOn: '2026-11-18',
        payerMemberId: bai!.memberId,
        splitMode: 'AMOUNT',
        splits: [
          { memberId: an!.memberId, amountCents: '2501' },
          { memberId: bai!.memberId, amountCents: '2500' },
          { memberId: chen!.memberId, amountCents: '2500' },
          { memberId: ding!.memberId, amountCents: '2500' },
        ],
        version: 1,
      }),
      endpoints.updateExpense.response,
    ).data;
    expect(updated).toMatchObject({
      version: 2,
      payerMemberId: bai!.memberId,
      splitMode: 'AMOUNT',
    });

    // Sequential stale A16, stale A17 and stale A23 all fail with 409 VERSION_CONFLICT.
    expectErr(
      await patch(an!, lodge.id, expenseBody(ledger, { payer: an! }, 1)),
      409,
      'VERSION_CONFLICT',
    );
    expectErr(await del(an!, lodge.id, 1), 409, 'VERSION_CONFLICT');
    expectErr(
      await fixture.app.inject({
        method: 'POST',
        url: `/api/v1/ledgers/${ledger.ledgerId}/settlement`,
        headers: bearer(an!, randomUUID()),
        payload: { expectedVersion: previewBefore.ledgerVersion },
      }),
      409,
      'VERSION_CONFLICT',
    );
    expect((await readExpenseRow(fixture, lodge.id))!.version).toBe(2);

    await assertExpenseFiltersAndCanEdit(ledger, lodge.id);

    // Soft-delete taxi and walk A14 cursor pagination + verify cross-endpoint conservation.
    parseOk(await del(chen!, taxi.id, 1), endpoints.deleteExpense.response);
    const page1 = parseOk(
      await fixture.app.inject({
        url: `/api/v1/ledgers/${ledger.ledgerId}/expenses?limit=1`,
        headers: bearer(an!),
      }),
      endpoints.listExpenses.response,
    );
    expect(page1.data.map((e) => e.id)).toEqual([lodge.id]);
    const page2 = parseOk(
      await fixture.app.inject({
        url: `/api/v1/ledgers/${ledger.ledgerId}/expenses?limit=2&cursor=${page1.page.nextCursor}`,
        headers: bearer(an!),
      }),
      endpoints.listExpenses.response,
    );
    expect(page2.data.map((e) => e.id)).toEqual([ticket.id]);
    expect(page2.page.nextCursor).toBeNull();
    await assertLedgerReadConservation(ledger, ding!, '22001');
  });

  it('enforces 409 LEDGER_FROZEN on A16/A17 across real SETTLING and SETTLED states while A28/A29 propagate cleanly', async () => {
    const ledger = await seedMultiMemberLedger(fixture);
    const { 小安: an, 小白: bai, 小陈: chen, 小丁: ding } = ledger.byName;
    const canteenId = await seedGushanViaEditAndDelete(ledger);
    const patch = updateExpenseRequest(fixture, ledger);
    const del = deleteExpenseRequest(fixture, ledger);

    const preview = parseOk(
      await fixture.app.inject({
        url: `/api/v1/ledgers/${ledger.ledgerId}/settlement-preview`,
        headers: bearer(an!),
      }),
      endpoints.previewSettlement.response,
    ).data;
    expect(preview).toMatchObject({
      expenseTotalCents: '30000',
      transferTotalCents: '9000',
      transferCount: 2,
    });

    // Freeze via real A23 startSettlement; both current and stale expense versions return LEDGER_FROZEN.
    const started = parseOk(
      await fixture.app.inject({
        method: 'POST',
        url: `/api/v1/ledgers/${ledger.ledgerId}/settlement`,
        headers: bearer(an!, randomUUID()),
        payload: { expectedVersion: preview.ledgerVersion },
      }),
      endpoints.startSettlement.response,
      201,
    ).data;
    expect(started.ledgerStatus).toBe('SETTLING');
    const keysBefore = await fixture.db.orm
      .select()
      .from(idempotencyKeys)
      .where(eq(idempotencyKeys.userId, an!.account.user.id));

    for (const staleOrCurrent of [1, 2]) {
      expectErr(
        await patch(an!, canteenId, expenseBody(ledger, { payer: an! }, staleOrCurrent)),
        409,
        'LEDGER_FROZEN',
      );
      expectErr(await del(chen!, canteenId, staleOrCurrent), 409, 'LEDGER_FROZEN');
    }
    expect(
      await fixture.db.orm
        .select()
        .from(idempotencyKeys)
        .where(eq(idempotencyKeys.userId, an!.account.user.id)),
    ).toHaveLength(keysBefore.length);

    // Rename users (A28) and update preferences (A29) while SETTLING; verify read views and frozen batch.
    const [ledgerSettling] = await fixture.db.orm
      .select()
      .from(ledgers)
      .where(eq(ledgers.id, ledger.ledgerId));
    await renameMe(an!, '鼓山小安');
    await renameMe(chen!, '鼓山小陈');
    await setNotificationPref(chen!, false);
    expect(
      parseOk(
        await fixture.app.inject({ url: '/api/v1/me', headers: bearer(chen!) }),
        endpoints.getMe.response,
      ).data,
    ).toMatchObject({ username: '鼓山小陈', notificationEnabled: false });

    const settlingViews = await assertLedgerReadConservation(ledger, ding!, '30000');
    expect(settlingViews.detail.version).toBe(ledgerSettling!.version);
    expect(Object.fromEntries(settlingViews.members.map((m) => [m.id, m.username]))).toEqual({
      [an!.memberId]: '鼓山小安',
      [bai!.memberId]: '小白',
      [chen!.memberId]: '鼓山小陈',
      [ding!.memberId]: '小丁',
    });
    const expenseDetail = parseOk(
      await fixture.app.inject({
        url: `/api/v1/ledgers/${ledger.ledgerId}/expenses/${canteenId}`,
        headers: bearer(an!),
      }),
      endpoints.getExpense.response,
    ).data;
    expect(expenseDetail).toMatchObject({
      payerName: '鼓山小安',
      recorderName: '鼓山小陈',
      canEdit: false,
    });

    await completeAllTransfersAndSettle(ledger, an!, chen!);
    expectErr(
      await patch(an!, canteenId, expenseBody(ledger, { payer: an! }, 2)),
      409,
      'LEDGER_FROZEN',
    );
    expectErr(await del(an!, canteenId, 2), 409, 'LEDGER_FROZEN');
    await renameMe(bai!, '鼓山小白');
    await setNotificationPref(bai!, false);

    const settledViews = await assertLedgerReadConservation(ledger, an!, '30000');
    expect(settledViews.balances.members.every((m) => m.remainingNetCents === '0')).toBe(true);
    expect(settledViews.stats.topExpenses.map((e) => e.payerName)).toContain('鼓山小白');
    const archivedList = parseOk(
      await fixture.app.inject({ url: '/api/v1/ledgers?archived=true', headers: bearer(chen!) }),
      endpoints.listLedgers.response,
    ).data;
    expect(archivedList).toHaveLength(1);
    expect(archivedList[0]).toMatchObject({ expenseTotalCents: '30000', myRemainingNetCents: '0' });
  });

  it('serializes A23 startSettlement against concurrent A16 updateExpense on the ledger row lock', async () => {
    const ledger = await seedMultiMemberLedger(fixture, ['小安', '小白']);
    const { 小安: an, 小白: bai } = ledger.byName;
    const expense = await createExpense(fixture, ledger, bai!, {
      title: '并发冻结测试',
      amountCents: '12000',
      payer: an!,
    });
    const preview = parseOk(
      await fixture.app.inject({
        url: `/api/v1/ledgers/${ledger.ledgerId}/settlement-preview`,
        headers: bearer(an!),
      }),
      endpoints.previewSettlement.response,
    ).data;
    const patch = updateExpenseRequest(fixture, ledger);

    const [freezeRes, editRes] = await raceExpenseWrites(fixture, ledger, [
      () =>
        fixture.app.inject({
          method: 'POST',
          url: `/api/v1/ledgers/${ledger.ledgerId}/settlement`,
          headers: bearer(an!, randomUUID()),
          payload: { expectedVersion: preview.ledgerVersion },
        }),
      () =>
        patch(
          bai!,
          expense.id,
          expenseBody(ledger, { title: '并发改额', amountCents: '16000', payer: an! }, 1),
        ),
    ]);

    if (freezeRes!.statusCode === 201) {
      expectErr(editRes!, 409, 'LEDGER_FROZEN');
      expect((await readExpenseRow(fixture, expense.id))!.version).toBe(1);
      await assertLedgerReadConservation(ledger, an!, '12000');
    } else {
      parseOk(editRes!, endpoints.updateExpense.response);
      expectErr(freezeRes!, 409, 'VERSION_CONFLICT');
      expect(
        await fixture.db.orm
          .select()
          .from(settlementBatches)
          .where(eq(settlementBatches.ledgerId, ledger.ledgerId)),
      ).toHaveLength(0);
      await assertLedgerReadConservation(ledger, an!, '16000');
    }
  });

  it('serializes concurrent A28 updateProfile and A29 updatePreferences on the user row lock', async () => {
    const account = await fixture.register('行锁初始名');
    const gate = await fixture.db.pool.connect();
    let pending: Promise<[Response, Response]> | undefined;
    try {
      await gate.query('BEGIN');
      const pid = (await gate.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!
        .pid;
      await gate.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [account.user.id]);
      pending = Promise.all([
        fixture.app.inject({
          method: 'PATCH',
          url: '/api/v1/me',
          headers: bearer(account),
          payload: { username: '行锁并发名' },
        }),
        fixture.app.inject({
          method: 'PATCH',
          url: '/api/v1/me/preferences',
          headers: bearer(account),
          payload: { notificationEnabled: false },
        }),
      ]);
      await waitForBlockedQueries(fixture.db.pool, pid, 2);
    } finally {
      await gate.query('ROLLBACK').catch(() => undefined);
      gate.release();
    }

    const [profileRes, prefRes] = await pending!;
    parseOk(profileRes, endpoints.updateProfile.response);
    parseOk(prefRes, endpoints.updatePreferences.response);

    const me = parseOk(
      await fixture.app.inject({ url: '/api/v1/me', headers: bearer(account) }),
      endpoints.getMe.response,
    ).data;
    expect(me).toEqual({
      id: account.user.id,
      username: '行锁并发名',
      email: account.user.email,
      notificationEnabled: false,
    });
    const [row] = await fixture.db.orm.select().from(users).where(eq(users.id, account.user.id));
    expect(row).toMatchObject({ username: '行锁并发名', notificationEnabled: false });

    const logs = await fixture.db.orm
      .select()
      .from(operationLogs)
      .where(eq(operationLogs.actorUserId, account.user.id))
      .orderBy(asc(operationLogs.createdAt));
    expect(logs.map((l) => l.action).sort()).toEqual(['PREFERENCES_UPDATED', 'PROFILE_UPDATED']);
  });
});
