import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { uploadedImageSchema } from '@tongzhang/contracts';
import type { Handler } from '../../http/context.js';
import type { Orm } from '../../db/transaction.js';
import { imageAssets } from '../../db/schema/index.js';
import { AppError } from '../../http/errors.js';
import { requireActive, requireLedgerMember } from '../ledgers/index.js';
import { validateImage } from './validation.js';

export interface ImagesService {
  uploadImage: Handler<'uploadImage'>;
  getImage: Handler<'getImage'>;
}
export function createImagesService(db: Orm): ImagesService {
  return {
    uploadImage: async (input, context) => {
      const userId = context.principal.userId;
      // Optional ledgerId is a permission precheck, never a premature business binding.
      if (input.body.ledgerId)
        requireActive(await requireLedgerMember(db, input.body.ledgerId, userId));
      const metadata = await validateImage(input.file.content, input.file.mimeType);
      const [image] = await db
        .insert(imageAssets)
        .values({
          uploadedByUserId: userId,
          kind: input.body.kind,
          ...metadata,
          byteSize: input.file.content.byteLength,
          content: Buffer.from(input.file.content),
          sha256: createHash('sha256').update(input.file.content).digest('hex'),
        })
        .returning({ imageId: imageAssets.id });
      return { data: { ...image!, ...metadata, byteSize: input.file.content.byteLength } };
    },
    getImage: async (input, context) => {
      const userId = context.principal.userId;
      return db.transaction(
        async (tx) => {
          const [image] = await tx
            .select({
              ledgerId: imageAssets.ledgerId,
              uploadedByUserId: imageAssets.uploadedByUserId,
            })
            .from(imageAssets)
            .where(eq(imageAssets.id, input.params.imageId));
          if (!image) throw new AppError('FORBIDDEN', '你没有权限读取此图片', 403);
          if (image.ledgerId) await requireLedgerMember(tx, image.ledgerId, userId);
          else if (image.uploadedByUserId !== userId)
            throw new AppError('FORBIDDEN', '你没有权限读取此图片', 403);
          const [file] = await tx
            .select({ content: imageAssets.content, mimeType: imageAssets.mimeType })
            .from(imageAssets)
            .where(eq(imageAssets.id, input.params.imageId));
          return {
            content: new Uint8Array(file!.content),
            mimeType: uploadedImageSchema.shape.mimeType.parse(file!.mimeType),
          };
        },
        { isolationLevel: 'repeatable read', accessMode: 'read only' },
      );
    },
  };
}
