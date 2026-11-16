import { randomUUID } from 'node:crypto';
import { and, asc, eq, isNotNull } from 'drizzle-orm';
import { expenseSplits, expenses, ledgerMembers } from '../../src/db/schema/index.js';
import type { integrationFixture, TestAccount } from './integration.js';
import { waitForBlockedQueries } from './locks.js';

type Fixture = Awaited<ReturnType<typeof integrationFixture>>;

export interface SeededMember {
  account: TestAccount;
  memberId: string;
}

export interface SeededLedger {
  ledgerId: string;
  /** In seeding order; the first member created the ledger. */
  members: SeededMember[];
  byName: Record<string, SeededMember>;
}

/** The Gushan four-person baseline from docs/code-standards.md. */
export const gushanMembers = ['小安', '小白', '小陈', '小丁'] as const;

/**
 * Register real accounts over HTTP (they need tokens for A16/A17) and attach them to one ledger.
 * Registration is rate limited per app, so keep each fixture instance to a handful of accounts.
 */
export async function seedMultiMemberLedger(
  fixture: Fixture,
  usernames: readonly string[] = gushanMembers,
): Promise<SeededLedger> {
  if (usernames.length < 2) throw new Error('A multi-member ledger needs at least two members');
  const accounts: TestAccount[] = [];
  for (const username of usernames) accounts.push(await fixture.register(username));
  const ledgerId = await fixture.ledger(accounts[0]!, accounts.slice(1));
  const rows = await fixture.db.orm
    .select({ id: ledgerMembers.id, userId: ledgerMembers.userId })
    .from(ledgerMembers)
    .where(eq(ledgerMembers.ledgerId, ledgerId));
  const members = accounts.map((account) => ({
    account,
    memberId: rows.find((r) => r.userId === account.user.id)!.id,
  }));
  return {
    ledgerId,
    members,
    byName: Object.fromEntries(members.map((m, i) => [usernames[i]!, m])),
  };
}

export interface ExpenseInput {
  title?: string;
  amountCents?: string;
  category?: string;
  occurredOn?: string;
  payer: SeededMember;
  /** EQUAL split between these members; defaults to every seeded member. */
  splitWith?: SeededMember[];
}

/** A valid EQUAL-mode A15/A16 body; pass `version` to turn it into an update body. */
export function expenseBody(ledger: SeededLedger, input: ExpenseInput, version?: number) {
  return {
    title: input.title ?? '隔离测试消费',
    amountCents: input.amountCents ?? '12000',
    category: input.category ?? 'DINING',
    occurredOn: input.occurredOn ?? '2026-11-16',
    payerMemberId: input.payer.memberId,
    splitMode: 'EQUAL',
    splits: (input.splitWith ?? ledger.members).map((m) => ({ memberId: m.memberId })),
    ...(version === undefined ? {} : { version }),
  };
}

const auth = (actor: SeededMember, key: string) => ({
  authorization: `Bearer ${actor.account.accessToken}`,
  'idempotency-key': key,
});

/** A15 over HTTP; throws unless the expense was created, and returns its id and version. */
export async function createExpense(
  fixture: Fixture,
  ledger: SeededLedger,
  recorder: SeededMember,
  input: ExpenseInput,
) {
  const res = await fixture.app.inject({
    method: 'POST',
    url: `/api/v1/ledgers/${ledger.ledgerId}/expenses`,
    headers: auth(recorder, randomUUID()),
    payload: expenseBody(ledger, input),
  });
  if (res.statusCode !== 201) throw new Error(`Fixture expense failed (${res.statusCode})`);
  const data = res.json().data as { id: string; version: number };
  return { id: data.id, version: data.version };
}

/** Create the three Gushan expenses (30000 cents total) on a ledger seeded with gushanMembers. */
export async function seedGushanExpenses(fixture: Fixture, ledger: SeededLedger) {
  const { 小安: an, 小白: bai, 小陈: chen } = ledger.byName;
  if (!an || !bai || !chen) throw new Error('Seed the ledger with gushanMembers first');
  return {
    canteen: await createExpense(fixture, ledger, an, {
      title: '食堂',
      amountCents: '12000',
      payer: an,
    }),
    tickets: await createExpense(fixture, ledger, bai, {
      title: '门票',
      amountCents: '12000',
      category: 'TICKET',
      payer: bai,
    }),
    taxi: await createExpense(fixture, ledger, chen, {
      title: '车费',
      amountCents: '6000',
      category: 'TRANSPORT',
      payer: chen,
      splitWith: [an, chen],
    }),
  };
}

/** A16 request; the caller inspects the status so conflicts can be asserted. */
export const updateExpenseRequest =
  (fixture: Fixture, ledger: SeededLedger) =>
  (actor: SeededMember, expenseId: string, body: object, key: string = randomUUID()) =>
    fixture.app.inject({
      method: 'PATCH',
      url: `/api/v1/ledgers/${ledger.ledgerId}/expenses/${expenseId}`,
      headers: auth(actor, key),
      payload: body,
    });

/** A17 request; the caller inspects the status so conflicts can be asserted. */
export const deleteExpenseRequest =
  (fixture: Fixture, ledger: SeededLedger) =>
  (actor: SeededMember, expenseId: string, version: number, key: string = randomUUID()) =>
    fixture.app.inject({
      method: 'DELETE',
      url: `/api/v1/ledgers/${ledger.ledgerId}/expenses/${expenseId}?version=${version}`,
      headers: auth(actor, key),
    });

/**
 * Run A16/A17 calls truly concurrently: hold the ledger row lock that expense writes take, wait
 * until every request is queued behind it, then release so they race for the same lock.
 */
export async function raceExpenseWrites<T>(
  fixture: Fixture,
  ledger: SeededLedger,
  requests: ReadonlyArray<() => Promise<T>>,
): Promise<T[]> {
  const gate = await fixture.db.pool.connect();
  let pending: Promise<T[]> | undefined;
  try {
    await gate.query('BEGIN');
    const pid = (await gate.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid;
    await gate.query('SELECT id FROM ledgers WHERE id = $1 FOR UPDATE', [ledger.ledgerId]);
    pending = Promise.all(requests.map((request) => request()));
    await waitForBlockedQueries(fixture.db.pool, pid, requests.length);
  } finally {
    await gate.query('ROLLBACK').catch(() => undefined);
    gate.release();
  }
  return pending!;
}

/** Soft-deleted rows stay in the table; read them (with splits) directly, bypassing API filters. */
export async function readSoftDeletedExpenses(fixture: Fixture, ledgerId: string) {
  const rows = await fixture.db.orm
    .select()
    .from(expenses)
    .where(and(eq(expenses.ledgerId, ledgerId), isNotNull(expenses.deletedAt)))
    .orderBy(asc(expenses.deletedAt), asc(expenses.id));
  const splits = await fixture.db.orm
    .select()
    .from(expenseSplits)
    .where(eq(expenseSplits.ledgerId, ledgerId));
  return rows.map((row) => ({
    ...row,
    splits: splits.filter((s) => s.expenseId === row.id),
  }));
}

/** Current database row for one expense, deleted or not. */
export async function readExpenseRow(fixture: Fixture, expenseId: string) {
  const [row] = await fixture.db.orm.select().from(expenses).where(eq(expenses.id, expenseId));
  return row;
}
