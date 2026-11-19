import { eq } from 'drizzle-orm';
import { uploadedImageSchema } from '@tongzhang/contracts';
import type { DatabaseExecutor, Transaction } from '../../db/transaction.js';
import type { ReceiptBinder } from '../expenses/index.js';
import { expenseImages, imageAssets } from '../../db/schema/index.js';
import { AppError } from '../../http/errors.js';

export interface DraftReceiptImage {
  imageId: string;
  mimeType: 'image/jpeg' | 'image/png';
  content: Uint8Array;
}

/** Read-only verification for AI draft parsing: must be an unbound RECEIPT uploaded by `userId`. */
export async function readDraftReceiptImage(
  db: DatabaseExecutor,
  input: { imageId: string; userId: string },
): Promise<DraftReceiptImage> {
  const [image] = await db
    .select({
      id: imageAssets.id,
      kind: imageAssets.kind,
      uploadedByUserId: imageAssets.uploadedByUserId,
      ledgerId: imageAssets.ledgerId,
      mimeType: imageAssets.mimeType,
      content: imageAssets.content,
    })
    .from(imageAssets)
    .where(eq(imageAssets.id, input.imageId));
  if (!image || image.uploadedByUserId !== input.userId)
    throw new AppError('FORBIDDEN', '你没有权限使用此图片', 403);
  if (image.kind !== 'RECEIPT' || image.ledgerId !== null)
    throw new AppError('IMAGE_INVALID', '请使用尚未绑定的收据图片', 400);
  return {
    imageId: image.id,
    mimeType: uploadedImageSchema.shape.mimeType.parse(image.mimeType),
    content: new Uint8Array(image.content),
  };
}

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
    if (!image || image.uploadedByUserId !== input.userId)
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

/** New ledger row already exists in this tx; never commit its temporary preset cover. */
export async function bindCover(
  tx: Transaction,
  input: { imageId: string; ledgerId: string; userId: string },
) {
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
  if (!image || image.uploadedByUserId !== input.userId)
    throw new AppError('FORBIDDEN', '你没有权限使用此图片', 403);
  if (image.kind !== 'COVER' || image.ledgerId !== null)
    throw new AppError('IMAGE_INVALID', '请使用尚未绑定的封面图片', 400);
  await tx
    .update(imageAssets)
    .set({ ledgerId: input.ledgerId })
    .where(eq(imageAssets.id, image.id));
}
