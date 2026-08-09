import { describe, expect, it } from 'vitest';
import { ImageAssetValidationError, validateImageAsset } from './media.js';

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

describe('local image asset validation', () => {
  it('accepts a matching bounded image and stores only a normalized filename', () => {
    expect(
      validateImageAsset({
        content: png,
        mimeType: 'image/png; charset=binary',
        originalFilename: 'C:\\Users\\demo\\架构图.png'
      })
    ).toMatchObject({
      mimeType: 'image/png',
      byteLength: png.length,
      originalFilename: '架构图.png'
    });
  });

  it('rejects a mismatched signature and unsupported active content', () => {
    expect(() => validateImageAsset({ content: png, mimeType: 'image/jpeg' })).toThrow(
      ImageAssetValidationError
    );
    expect(() =>
      validateImageAsset({ content: Buffer.from('<svg/>'), mimeType: 'image/svg+xml' })
    ).toThrowError(/PNG、JPEG、WebP 和 GIF/);
  });
});
