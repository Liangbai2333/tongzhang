import { and, eq, gt, isNull } from 'drizzle-orm';
import { authSessions, users } from '../../db/schema/index.js';
import type { DatabaseExecutor, Transaction } from '../../db/transaction.js';
export async function findActiveSession(db: DatabaseExecutor, tokenHash: string, now = new Date()) {
  const [session] = await db
    .select({ id: authSessions.id, userId: authSessions.userId })
    .from(authSessions)
    .where(
      and(
        eq(authSessions.tokenHash, tokenHash),
        isNull(authSessions.revokedAt),
        gt(authSessions.expiresAt, now),
      ),
    )
    .limit(1);
  return session ?? null;
}

export async function insertUser(tx: Transaction, input: typeof users.$inferInsert) {
  const [user] = await tx
    .insert(users)
    .values(input)
    .onConflictDoNothing({ target: users.email })
    .returning();
  return user ?? null;
}

export function insertSession(tx: Transaction, input: typeof authSessions.$inferInsert) {
  return tx.insert(authSessions).values(input);
}

export function findLoginUsers(db: DatabaseExecutor, account: string) {
  return db
    .select()
    .from(users)
    .where(
      account.includes('@') ? eq(users.email, account.toLowerCase()) : eq(users.username, account),
    )
    .limit(2);
}

export async function revokeSession(tx: Transaction, sessionId: string, userId: string) {
  await tx
    .update(authSessions)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(authSessions.id, sessionId),
        eq(authSessions.userId, userId),
        isNull(authSessions.revokedAt),
      ),
    );
}
