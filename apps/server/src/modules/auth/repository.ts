import { and, eq, gt, isNull } from 'drizzle-orm';
import { authRefreshTokens, authSessions, users } from '../../db/schema/index.js';
import type { DatabaseExecutor, Transaction } from '../../db/transaction.js';
export async function findActiveSession(
  db: DatabaseExecutor,
  sessionId: string,
  userId: string,
  now = new Date(),
) {
  const [session] = await db
    .select({ id: authSessions.id, userId: authSessions.userId })
    .from(authSessions)
    .where(
      and(
        eq(authSessions.id, sessionId),
        eq(authSessions.userId, userId),
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
  return tx.insert(authSessions).values(input).returning();
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

export function insertRefreshToken(tx: Transaction, sessionId: string, tokenHash: string) {
  return tx.insert(authRefreshTokens).values({ sessionId, tokenHash });
}

export async function lockRefreshSession(tx: Transaction, tokenHash: string) {
  const [token] = await tx
    .select({ sessionId: authRefreshTokens.sessionId })
    .from(authRefreshTokens)
    .where(eq(authRefreshTokens.tokenHash, tokenHash))
    .limit(1);
  if (!token) return null;
  const [session] = await tx
    .select()
    .from(authSessions)
    .where(eq(authSessions.id, token.sessionId))
    .for('update');
  if (!session) return null;
  // Read after taking the session lock: a competing refresh may have consumed it.
  const [current] = await tx
    .select()
    .from(authRefreshTokens)
    .where(eq(authRefreshTokens.tokenHash, tokenHash));
  return current ? { session, token: current } : null;
}

export function consumeRefreshToken(tx: Transaction, tokenHash: string, now: Date) {
  return tx
    .update(authRefreshTokens)
    .set({ consumedAt: now })
    .where(eq(authRefreshTokens.tokenHash, tokenHash));
}
