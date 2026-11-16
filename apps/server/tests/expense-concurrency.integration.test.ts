import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { expenses, ledgers } from '../src/db/schema/index.js';
import { integrationFixture } from './fixtures/integration.js';
import {
  createExpense,
  deleteExpenseRequest,
  expenseBody,
  raceExpenseWrites,
  readExpenseRow,
  readSoftDeletedExpenses,
  seedGushanExpenses,
  seedMultiMemberLedger,
  updateExpenseRequest,
} from './fixtures/expenses.js';

let fixture: Awaited<ReturnType<typeof integrationFixture>>;
beforeEach(async () => {
  fixture = await integrationFixture();
});
afterEach(async () => {
  await fixture.close();
});

const ledgerVersion = async (ledgerId: string) =>
  (await fixture.db.orm.select().from(ledgers).where(eq(ledgers.id, ledgerId)))[0]!.version;

const activeTotal = async (ledgerId: string) =>
  (
    await fixture.db.orm
      .select({ total: sql<string>`coalesce(sum(${expenses.amountCents}), 0)::text` })
      .from(expenses)
      .where(and(eq(expenses.ledgerId, ledgerId), isNull(expenses.deletedAt)))
  )[0]!.total;

describe('B15 concurrent A16/A17 on isolated PostgreSQL', () => {
  it('resolves a concurrent edit and delete of one expense to exactly one winner', async () => {
    const ledger = await seedMultiMemberLedger(fixture);
    const { 小安: an, 小陈: chen } = ledger.byName;
    const { canteen, taxi } = await seedGushanExpenses(fixture, ledger);
    const patch = updateExpenseRequest(fixture, ledger);
    const del = deleteExpenseRequest(fixture, ledger);
    const before = await ledgerVersion(ledger.ledgerId);

    // Both requests carry version 1 and are queued behind the same ledger lock before racing.
    const [edited, deleted] = await raceExpenseWrites(fixture, ledger, [
      () =>
        patch(
          chen!,
          taxi.id,
          expenseBody(
            ledger,
            { title: '车费改', amountCents: '8000', payer: chen!, splitWith: [an!, chen!] },
            taxi.version,
          ),
        ),
      () => del(an!, taxi.id, taxi.version),
    ]);

    expect([edited!.statusCode, deleted!.statusCode].filter((s) => s === 200)).toHaveLength(1);
    expect(await ledgerVersion(ledger.ledgerId)).toBe(before + 1);
    const row = await readExpenseRow(fixture, taxi.id);
    const softDeleted = await readSoftDeletedExpenses(fixture, ledger.ledgerId);

    if (edited!.statusCode === 200) {
      // Edit committed first: the delete still carries version 1 and loses on the version check.
      expect(deleted!.statusCode).toBe(409);
      expect(deleted!.json().error.code).toBe('VERSION_CONFLICT');
      expect(row!.deletedAt).toBeNull();
      expect(row!.version).toBe(2);
      expect(row!.amountCents).toBe(8000n);
      expect(softDeleted).toEqual([]);
      expect(await activeTotal(ledger.ledgerId)).toBe('32000');
    } else {
      // Delete committed first: a soft-deleted expense is no longer visible to A16.
      expect(edited!.statusCode).toBe(404);
      expect(edited!.json().error.code).toBe('NOT_FOUND');
      expect(row!.version).toBe(1);
      expect(row!.amountCents).toBe(6000n);
      expect(softDeleted.map((e) => e.id)).toEqual([taxi.id]);
      expect(softDeleted[0]!.splits.map((s) => s.amountCents).sort()).toEqual([3000n, 3000n]);
      expect(await activeTotal(ledger.ledgerId)).toBe('24000');
    }
    // The untouched expense keeps its version either way.
    expect((await readExpenseRow(fixture, canteen.id))!.version).toBe(1);
  });

  it('lets exactly one of two concurrent same-version edits win with 409 VERSION_CONFLICT', async () => {
    const ledger = await seedMultiMemberLedger(fixture, ['小安', '小白', '小陈']);
    const { 小安: an, 小白: bai } = ledger.byName;
    const expense = await createExpense(fixture, ledger, an!, { payer: an!, amountCents: '9000' });
    const patch = updateExpenseRequest(fixture, ledger);
    const before = await ledgerVersion(ledger.ledgerId);

    const results = await raceExpenseWrites(fixture, ledger, [
      () => patch(an!, expense.id, expenseBody(ledger, { payer: an!, amountCents: '9300' }, 1)),
      () => patch(an!, expense.id, expenseBody(ledger, { payer: bai!, amountCents: '9600' }, 1)),
    ]);

    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    const winner = results.find((r) => r.statusCode === 200)!;
    const loser = results.find((r) => r.statusCode === 409)!;
    expect(loser.json().error.code).toBe('VERSION_CONFLICT');
    const row = await readExpenseRow(fixture, expense.id);
    expect(row!.version).toBe(2);
    expect(String(row!.amountCents)).toBe(winner.json().data.amountCents);
    expect(await ledgerVersion(ledger.ledgerId)).toBe(before + 1);
  });

  it('applies concurrent writes on different expenses and keeps soft-deleted rows readable', async () => {
    const ledger = await seedMultiMemberLedger(fixture);
    const { 小安: an, 小丁: ding } = ledger.byName;
    const { canteen, tickets } = await seedGushanExpenses(fixture, ledger);
    const mistake = await createExpense(fixture, ledger, ding!, {
      title: '误记零食',
      amountCents: '5000',
      payer: ding!,
    });
    expect(await activeTotal(ledger.ledgerId)).toBe('35000');
    const before = await ledgerVersion(ledger.ledgerId);
    const patch = updateExpenseRequest(fixture, ledger);
    const del = deleteExpenseRequest(fixture, ledger);

    const [removed, renamed] = await raceExpenseWrites(fixture, ledger, [
      () => del(an!, mistake.id, mistake.version),
      () =>
        patch(
          an!,
          canteen.id,
          expenseBody(ledger, { title: '鼓山食堂', amountCents: '12000', payer: an! }, 1),
        ),
    ]);

    expect(removed!.statusCode).toBe(200);
    expect(removed!.json()).toEqual({ data: { deletedId: mistake.id } });
    expect(renamed!.statusCode).toBe(200);
    expect(await ledgerVersion(ledger.ledgerId)).toBe(before + 2);
    // Gushan baseline restored: 30000 cents of active expenses, the mistake kept as a soft delete.
    expect(await activeTotal(ledger.ledgerId)).toBe('30000');
    const softDeleted = await readSoftDeletedExpenses(fixture, ledger.ledgerId);
    expect(softDeleted.map((e) => [e.id, e.title, e.version])).toEqual([
      [mistake.id, '误记零食', 1],
    ]);
    expect(softDeleted[0]!.splits).toHaveLength(4);
    expect(softDeleted[0]!.splits.reduce((sum, s) => sum + s.amountCents, 0n)).toBe(5000n);
    expect((await readExpenseRow(fixture, tickets.id))!.version).toBe(1);
  });
});
