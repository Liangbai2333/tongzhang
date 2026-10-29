import { and, desc, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { expenseSummarySchema, localDateSchema, uuidSchema } from '@tongzhang/contracts';
import type { EndpointParsedInput } from '@tongzhang/contracts';
import type { DatabaseExecutor } from '../../db/transaction.js';
import { expenses, ledgerMembers, users } from '../../db/schema/index.js';
import { decodeCursor, encodeCursor } from '../../http/cursor.js';

const cursorSchema = z.tuple([localDateSchema, uuidSchema]);

/** Keyset pagination follows the partial ledger/date/id index, including equal-date ties. */
export async function queryExpenses(
  db: DatabaseExecutor,
  ledgerId: string,
  query: EndpointParsedInput<'listExpenses'>['query'],
) {
  const after = query.cursor ? decodeCursor(query.cursor, cursorSchema) : null;
  const rows = await db
    .select({ expense: expenses, payerName: users.username })
    .from(expenses)
    .innerJoin(ledgerMembers, eq(ledgerMembers.id, expenses.payerMemberId))
    .innerJoin(users, eq(users.id, ledgerMembers.userId))
    .where(
      and(
        eq(expenses.ledgerId, ledgerId),
        isNull(expenses.deletedAt),
        query.from ? gte(expenses.occurredOn, query.from) : undefined,
        query.to ? lte(expenses.occurredOn, query.to) : undefined,
        query.payerMemberId ? eq(expenses.payerMemberId, query.payerMemberId) : undefined,
        query.category ? eq(expenses.category, query.category) : undefined,
        after
          ? sql`(${expenses.occurredOn}, ${expenses.id}) < (${after[0]}::date, ${after[1]}::uuid)`
          : undefined,
      ),
    )
    .orderBy(desc(expenses.occurredOn), desc(expenses.id))
    .limit(query.limit + 1);
  const page = rows.slice(0, query.limit);
  const last = page.at(-1)?.expense;
  return {
    data: page.map(({ expense, payerName }) =>
      expenseSummarySchema.parse({
        ...expense,
        amountCents: expense.amountCents.toString(),
        payerName,
      }),
    ),
    page: {
      nextCursor:
        rows.length > query.limit && last ? encodeCursor([last.occurredOn, last.id]) : null,
    },
  };
}
