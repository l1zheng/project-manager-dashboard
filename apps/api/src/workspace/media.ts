import { createHash } from 'node:crypto';

export const maximumImageAssetBytes = 10 * 1024 * 1024;
export const supportedImageMimeTypes = ['image/png', 'image/jpeg', 'image/gif'] as const;

export type SupportedImageMimeType = (typeof supportedImageMimeTypes)[number];

export class ImageAssetValidationError extends Error {
  constructor(
    readonly code:
      | 'image_body_required'
      | 'image_too_large'
      | 'image_type_unsupported'
      | 'image_signature_invalid',
    message: string
  ) {
    super(message);
    this.name = 'ImageAssetValidationError';
  }
}

export function validateImageAsset(input: {
  content: Buffer;
  mimeType: string;
  originalFilename?: string | null;
}) {
  if (input.content.length === 0) {
    throw new ImageAssetValidationError('image_body_required', '请选择图片文件。');
  }
  if (input.content.length > maximumImageAssetBytes) {
    throw new ImageAssetValidationError(
      'image_too_large',
      `图片不能超过 ${maximumImageAssetBytes / 1024 / 1024} MB。`
    );
  }
  const mimeType = input.mimeType.toLowerCase().split(';', 1)[0]?.trim();
  if (!supportedImageMimeTypes.includes(mimeType as SupportedImageMimeType)) {
    throw new ImageAssetValidationError('image_type_unsupported', '仅支持 PNG、JPEG 和 GIF 图片。');
  }
  if (!hasExpectedSignature(input.content, mimeType as SupportedImageMimeType)) {
    throw new ImageAssetValidationError(
      'image_signature_invalid',
      '图片内容与声明的文件类型不一致。'
    );
  }
  return {
    content: input.content,
    mimeType: mimeType as SupportedImageMimeType,
    byteLength: input.content.length,
    sha256: createHash('sha256').update(input.content).digest('hex'),
    originalFilename: normalizeFilename(input.originalFilename)
  };
}

function hasExpectedSignature(content: Buffer, mimeType: SupportedImageMimeType): boolean {
  switch (mimeType) {
    case 'image/png':
      return content
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case 'image/jpeg':
      return (
        content.length >= 3 && content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff
      );
    case 'image/gif':
      return (
        content.subarray(0, 6).toString('ascii') === 'GIF87a' ||
        content.subarray(0, 6).toString('ascii') === 'GIF89a'
      );
  }
}

function normalizeFilename(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = Array.from(value)
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint >= 0x20 && codePoint !== 0x7f;
    })
    .join('')
    .replace(/.*[\\/]/, '')
    .trim();
  return normalized ? Array.from(normalized).slice(0, 255).join('') : null;
}
