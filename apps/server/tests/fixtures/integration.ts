import { randomUUID } from 'node:crypto';
import { inArray } from 'drizzle-orm';
import { authResultSchema, type EndpointOutput } from '@tongzhang/contracts';
import { buildApp } from '../../src/app.js';
import { createDatabase } from '../../src/db/client.js';
import {
  authSessions,
  expenseImages,
  expenseSplits,
  expenses,
  imageAssets,
  idempotencyKeys,
  invitations,
  ledgerMembers,
  ledgers,
  operationLogs,
  users,
} from '../../src/db/schema/index.js';
import { testEnv } from './env.js';
import { testDatabaseUrl } from './database.js';

export const testPassword = 'fixture-password-2026';
export type TestAccount = EndpointOutput<'register'>['data'];

/** Real HTTP accounts and explicitly owned ledger rows; no global table truncation. */
export async function integrationFixture() {
  const target = testDatabaseUrl();
  const db = createDatabase(target);
  const app = await buildApp(testEnv, createDatabase(target));
  const userIds: string[] = [];
  const ledgerIds: string[] = [];
  return {
    app,
    db,
    async register(username = '隔离测试用户'): Promise<TestAccount> {
      const result = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          username,
          email: `${randomUUID()}@example.test`,
          password: testPassword,
          acceptTerms: true,
        },
      });
      if (result.statusCode !== 201)
        throw new Error(`Fixture registration failed (${result.statusCode})`);
      const account = authResultSchema.parse(result.json().data);
      userIds.push(account.user.id);
      return account;
    },
    /** Database-only user for bulk membership setup; registration is rate limited per app. */
    async seedUser(username: string) {
      const [row] = await db.orm
        .insert(users)
        .values({
          username,
          email: `${randomUUID()}@example.test`,
          passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$c2VlZGVkLW9ubHk$c2VlZGVkLW9ubHktaGFzaA',
        })
        .returning({ id: users.id });
      userIds.push(row!.id);
      return row!.id;
    },
    async ledger(owner: TestAccount, members: TestAccount[] = []) {
      const id = randomUUID();
      ledgerIds.push(id);
      await db.orm.transaction(async (tx) => {
        await tx
          .insert(ledgers)
          .values({ id, createdByUserId: owner.user.id, name: '隔离测试账本' });
        await tx
          .insert(ledgerMembers)
          .values(
            [owner, ...members].map((account) => ({ ledgerId: id, userId: account.user.id })),
          );
      });
      return id;
    },
    async close() {
      try {
        await app.close();
      } finally {
        try {
          await db.orm.transaction(async (tx) => {
            if (userIds.length) {
              await tx.delete(operationLogs).where(inArray(operationLogs.actorUserId, userIds));
              await tx.delete(idempotencyKeys).where(inArray(idempotencyKeys.userId, userIds));
            }
            // Ledgers created through the HTTP API are owned by fixture users; clean them as well.
            const owned = userIds.length
              ? await tx
                  .select({ id: ledgers.id })
                  .from(ledgers)
                  .where(inArray(ledgers.createdByUserId, userIds))
              : [];
            for (const row of owned) if (!ledgerIds.includes(row.id)) ledgerIds.push(row.id);
            if (ledgerIds.length) {
              await tx.delete(operationLogs).where(inArray(operationLogs.ledgerId, ledgerIds));
              await tx.delete(expenseImages).where(inArray(expenseImages.ledgerId, ledgerIds));
              await tx.delete(expenseSplits).where(inArray(expenseSplits.ledgerId, ledgerIds));
              await tx.delete(expenses).where(inArray(expenses.ledgerId, ledgerIds));
              await tx
                .update(ledgers)
                .set({ coverImageId: null, coverKey: 'plain' })
                .where(inArray(ledgers.id, ledgerIds));
            }
            if (userIds.length)
              await tx.delete(imageAssets).where(inArray(imageAssets.uploadedByUserId, userIds));
            if (ledgerIds.length) {
              await tx.delete(invitations).where(inArray(invitations.ledgerId, ledgerIds));
              await tx.delete(ledgerMembers).where(inArray(ledgerMembers.ledgerId, ledgerIds));
              await tx.delete(ledgers).where(inArray(ledgers.id, ledgerIds));
            }
            if (userIds.length) {
              await tx.delete(authSessions).where(inArray(authSessions.userId, userIds));
              await tx.delete(users).where(inArray(users.id, userIds));
            }
          });
        } finally {
          await db.close();
        }
      }
    },
  };
}
