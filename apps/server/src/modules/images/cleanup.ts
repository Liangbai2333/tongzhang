import { and, asc, eq, inArray, isNull, notExists, sql } from 'drizzle-orm';
import { expenseImages, imageAssets, ledgers } from '../../db/schema/index.js';
import { withTransaction, type Orm } from '../../db/transaction.js';

export const IMAGE_CLEANUP_BATCH_SIZE = 100;

/** One bounded batch. Only asset locks are acquired; locked binders/cleaners are skipped. */
export async function cleanupTemporaryImages(db: Orm): Promise<number> {
  return withTransaction(db, async (tx) => {
    const unused = and(
      isNull(imageAssets.ledgerId),
      sql`${imageAssets.createdAt} < now() - interval '24 hours'`,
      notExists(
        tx.select({ id: ledgers.id }).from(ledgers).where(eq(ledgers.coverImageId, imageAssets.id)),
      ),
      notExists(
        tx
          .select({ id: expenseImages.imageId })
          .from(expenseImages)
          .where(eq(expenseImages.imageId, imageAssets.id)),
      ),
    );
    const candidates = await tx
      .select({ id: imageAssets.id })
      .from(imageAssets)
      .where(unused)
      .orderBy(asc(imageAssets.createdAt), asc(imageAssets.id))
      .limit(IMAGE_CLEANUP_BATCH_SIZE)
      .for('update', { skipLocked: true });
    if (!candidates.length) return 0;
    // Recheck references in the deleting statement, while retaining all candidate row locks.
    const deleted = await tx
      .delete(imageAssets)
      .where(
        and(
          inArray(
            imageAssets.id,
            candidates.map((row) => row.id),
          ),
          unused,
        ),
      )
      .returning({ id: imageAssets.id });
    return deleted.length;
  });
}
