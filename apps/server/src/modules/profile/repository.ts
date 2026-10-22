import { eq } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../db/transaction.js';
import { users } from '../../db/schema/index.js';
export async function findUser(db: DatabaseExecutor, id: string) {
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return user ?? null;
}
