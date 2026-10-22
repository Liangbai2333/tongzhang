import { z } from 'zod';
import { uuidSchema } from './scalars.js';
import { MAX_IMAGE_BYTES } from './limits.js';
export const imageMetadataSchema = z.strictObject({
  kind: z.enum(['COVER', 'RECEIPT']),
  ledgerId: uuidSchema.optional(),
});
export const uploadedImageSchema = z.object({
  imageId: uuidSchema,
  mimeType: z.enum(['image/jpeg', 'image/png']),
  byteSize: z.number().int().positive().max(MAX_IMAGE_BYTES),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
