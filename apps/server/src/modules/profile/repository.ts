import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { NotificationType } from '@tongzhang/contracts';
import type { DatabaseExecutor, Transaction } from '../../db/transaction.js';
import { ledgers, notifications, users } from '../../db/schema/index.js';

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

export interface FindNotificationsParams {
  recipientUserId: string;
  unreadOnly: boolean;
  limit: number;
  after: readonly [string, string] | null;
}

export async function findNotifications(db: DatabaseExecutor, params: FindNotificationsParams) {
  const createdText = sql<string>`to_char(${notifications.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
  return db
    .select({
      notification: notifications,
      ledgerName: ledgers.name,
      actorName: users.username,
      createdText,
    })
    .from(notifications)
    .innerJoin(ledgers, eq(ledgers.id, notifications.ledgerId))
    .innerJoin(users, eq(users.id, notifications.actorUserId))
    .where(
      and(
        eq(notifications.recipientUserId, params.recipientUserId),
        params.unreadOnly ? isNull(notifications.readAt) : undefined,
        params.after
          ? sql`(${notifications.createdAt}, ${notifications.id}) < (${params.after[0]}::timestamptz, ${params.after[1]}::uuid)`
          : undefined,
      ),
    )
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(params.limit + 1);
}

export async function lockNotification(tx: Transaction, id: string) {
  const [notification] = await tx
    .select()
    .from(notifications)
    .where(eq(notifications.id, id))
    .for('update');
  return notification ?? null;
}

export async function markNotificationReadAt(tx: Transaction, id: string, readAt: Date) {
  const [notification] = await tx
    .update(notifications)
    .set({ readAt })
    .where(eq(notifications.id, id))
    .returning();
  return notification ?? null;
}

export interface InsertNotificationInput {
  recipientUserId: string;
  actorUserId: string;
  type: NotificationType;
  ledgerId: string;
  transferId: string;
  amountCents: bigint;
  note: string | null;
  createdAt?: Date;
}

export async function insertNotification(tx: Transaction, input: InsertNotificationInput) {
  const [notification] = await tx
    .insert(notifications)
    .values({
      recipientUserId: input.recipientUserId,
      actorUserId: input.actorUserId,
      type: input.type,
      ledgerId: input.ledgerId,
      transferId: input.transferId,
      amountCents: input.amountCents,
      note: input.note,
      ...(input.createdAt === undefined ? {} : { createdAt: input.createdAt }),
    })
    .returning();
  return notification!;
}
