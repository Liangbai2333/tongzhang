import { eq } from 'drizzle-orm';
import type { DatabaseExecutor, Transaction } from '../../db/transaction.js';
import { users } from '../../db/schema/index.js';

export async function findUser(db: DatabaseExecutor, id: string) {
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return user ?? null;
}

export async function lockUser(tx: Transaction, id: string) {
  const [user] = await tx.select().from(users).where(eq(users.id, id)).for('update');
  return user ?? null;
}

export async function updateUsername(
  tx: Transaction,
  id: string,
  username: string,
  updatedAt: Date,
) {
  const [user] = await tx
    .update(users)
    .set({ username, updatedAt })
    .where(eq(users.id, id))
    .returning();
  return user ?? null;
}

export async function updateNotificationPreference(
  tx: Transaction,
  id: string,
  notificationEnabled: boolean,
  updatedAt: Date,
) {
  const [user] = await tx
    .update(users)
    .set({ notificationEnabled, updatedAt })
    .where(eq(users.id, id))
    .returning();
  return user ?? null;
}
