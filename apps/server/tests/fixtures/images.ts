import sharp from 'sharp';

export const imageBytes = (format: 'jpeg' | 'png' = 'png', width = 4, height = 3) =>
  sharp({ create: { width, height, channels: 3, background: '#e4a471' } })
    .toFormat(format)
    .toBuffer();

/** Real multipart wire bytes; fields may precede or follow the image. */
export function imageMultipart(
  content: Buffer,
  mimeType = 'image/png',
  fields: [string, string][] = [['kind', 'RECEIPT']],
  fileFirst = false,
) {
  const boundary = 'tongzhang-image-test-boundary';
  const parts = fields.map(([name, value]) =>
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
    ),
  );
  const file = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="test-image"\r\nContent-Type: ${mimeType}\r\n\r\n`,
    ),
    content,
    Buffer.from('\r\n'),
  ]);
  return {
    payload: Buffer.concat([
      ...(fileFirst ? [file, ...parts] : [...parts, file]),
      Buffer.from(`--${boundary}--\r\n`),
    ]),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}
