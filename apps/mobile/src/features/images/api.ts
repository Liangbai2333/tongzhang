import {
  envelope,
  imageMetadataSchema,
  uploadedImageSchema,
  uuidSchema,
} from '@tongzhang/contracts';
import type { z } from 'zod';
import { requestJson, requestImage } from '@/lib/http';
import { sessionToken } from '@/lib/session-token';
import { File } from 'expo-file-system';
export interface NativeImage {
  uri: string;
  name: string;
  type: 'image/jpeg' | 'image/png';
}
export const imagesApi = {
  async upload(metadata: z.input<typeof imageMetadataSchema>, image: NativeImage) {
    const fields = imageMetadataSchema.parse(metadata);
    const data = new FormData();
    data.append('kind', fields.kind);
    if (fields.ledgerId) data.append('ledgerId', fields.ledgerId);
    // SDK 57 uses standards-based fetch globally: multipart parts must be Blob/File.
    data.append('file', new File(image.uri), image.name);
    return sessionToken.authorized((token) =>
      requestJson('/api/v1/images', envelope(uploadedImageSchema), {
        method: 'POST',
        token,
        formData: data,
        timeoutMs: 30000,
      }),
    );
  },
  async read(imageId: string) {
    const id = uuidSchema.parse(imageId);
    return sessionToken.authorized((token) => requestImage(`/api/v1/images/${id}`, token));
  },
};
