import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { MAX_IMAGE_BYTES } from '@tongzhang/contracts';
import { validateImage } from '../src/modules/images/validation.js';
import { imageBytes } from './fixtures/images.js';

describe('actual image validation', () => {
  it.each(['jpeg', 'png'] as const)(
    'decodes %s and reports its actual dimensions',
    async (format) => {
      const content = await imageBytes(format);
      expect(await validateImage(content, `image/${format}`)).toEqual({
        mimeType: `image/${format}`,
        width: 4,
        height: 3,
      });
    },
  );

  it('rejects a spoofed MIME, SVG, empty and invalid contents', async () => {
    for (const [content, mimeType] of [
      [await imageBytes('png'), 'image/jpeg'],
      [await imageBytes('jpeg'), 'image/png'],
      [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'), 'image/png'],
      [Buffer.alloc(0), 'image/png'],
      [Buffer.from('not an image'), 'image/png'],
      [await imageBytes(), 'application/octet-stream'],
    ] as const) {
      await expect(validateImage(content, mimeType)).rejects.toMatchObject({
        code: 'IMAGE_INVALID',
        statusCode: 400,
      });
    }
  });

  it.each(['jpeg', 'png'] as const)(
    'rejects truncated %s even if the metadata header is valid',
    async (format) => {
      const complete = await imageBytes(format, 100, 100);
      const truncated = complete.subarray(0, complete.length - (format === 'jpeg' ? 20 : 30));
      expect((await sharp(truncated).metadata()).format).toBe(format);
      await expect(validateImage(truncated, `image/${format}`)).rejects.toMatchObject({
        code: 'IMAGE_INVALID',
      });
    },
  );

  it('accepts exactly 1 MiB and rejects larger files before decoding', async () => {
    const jpeg = await imageBytes('jpeg');
    const exact = Buffer.concat([jpeg, Buffer.alloc(MAX_IMAGE_BYTES - jpeg.length)]);
    expect(await validateImage(exact, 'image/jpeg')).toMatchObject({ width: 4, height: 3 });
    await expect(
      validateImage(Buffer.alloc(MAX_IMAGE_BYTES + 1), 'image/png'),
    ).rejects.toMatchObject({ statusCode: 413 });
  });

  it('rejects excessive edge lengths and pixel counts before full decoding', async () => {
    for (const [width, height] of [
      [4097, 1],
      [1, 4097],
      [4001, 4001],
    ]) {
      const content = await imageBytes('png', width, height);
      await expect(validateImage(content, 'image/png')).rejects.toMatchObject({ statusCode: 400 });
    }
  });
});
