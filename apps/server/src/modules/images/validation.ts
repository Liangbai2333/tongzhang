import sharp from 'sharp';
import { MAX_IMAGE_BYTES } from '@tongzhang/contracts';
import { AppError } from '../../http/errors.js';

/** Metadata alone does not decode pixels. Force full decoding before accepting any bytes. */
export async function validateImage(
  content: Uint8Array,
  mimeType: string,
): Promise<{ mimeType: 'image/jpeg' | 'image/png'; width: number; height: number }> {
  if (content.byteLength > MAX_IMAGE_BYTES)
    throw new AppError('PAYLOAD_TOO_LARGE', '图片不能超过1 MiB', 413);
  const invalid = () =>
    new AppError(
      'IMAGE_INVALID',
      '请选择完整有效的 JPEG 或 PNG 图片（最大4096边长、1600万像素）',
      400,
    );
  if (!content.byteLength || !['image/jpeg', 'image/png'].includes(mimeType)) throw invalid();
  try {
    const image = sharp(content, { failOn: 'warning', limitInputPixels: 16_000_000 });
    const metadata = await image.metadata();
    const actualMime =
      metadata.format === 'jpeg' ? 'image/jpeg' : metadata.format === 'png' ? 'image/png' : null;
    if (
      !actualMime ||
      actualMime !== mimeType ||
      !metadata.width ||
      !metadata.height ||
      metadata.width > 4096 ||
      metadata.height > 4096 ||
      (metadata.pages ?? 1) !== 1
    )
      throw invalid();
    await image.raw().toBuffer();
    return {
      mimeType: actualMime,
      width: metadata.width,
      height: metadata.height,
    };
  } catch {
    throw invalid();
  }
}
