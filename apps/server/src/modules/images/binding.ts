import { eq } from 'drizzle-orm';
import type { ReceiptBinder } from '../expenses/index.js';
import { expenseImages, imageAssets } from '../../db/schema/index.js';
import { AppError } from '../../http/errors.js';

/** Caller holds the ledger lock; acquire the asset lock second and use the caller's tx only. */
export const receiptBinder: ReceiptBinder = {
  async bind(tx, input) {
    const [image] = await tx
      .select({
        id: imageAssets.id,
        kind: imageAssets.kind,
        uploadedByUserId: imageAssets.uploadedByUserId,
        ledgerId: imageAssets.ledgerId,
      })
      .from(imageAssets)
      .where(eq(imageAssets.id, input.imageId))
      .for('update');
    if (!image || image.uploadedByUserId !== input.userId.toLowerCase())
      throw new AppError('FORBIDDEN', '你没有权限使用此图片', 403);
    if (image.kind !== 'RECEIPT' || image.ledgerId !== null)
      throw new AppError('IMAGE_INVALID', '请使用尚未绑定的收据图片', 400);
    await tx
      .update(imageAssets)
      .set({ ledgerId: input.ledgerId })
      .where(eq(imageAssets.id, image.id));
    await tx.insert(expenseImages).values({
      ledgerId: input.ledgerId,
      expenseId: input.expenseId,
      imageId: image.id,
    });
  },
};
