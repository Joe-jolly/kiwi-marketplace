import { detectImageMimeType } from './image-signature.util';

describe('detectImageMimeType', () => {
  it('detects a JPEG signature (FF D8 FF)', () => {
    const buffer = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      Buffer.from('rest-of-file'),
    ]);
    expect(detectImageMimeType(buffer)).toBe('image/jpeg');
  });

  it('detects a PNG signature', () => {
    const buffer = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from('rest-of-file'),
    ]);
    expect(detectImageMimeType(buffer)).toBe('image/png');
  });

  it('detects a WebP signature (RIFF....WEBP)', () => {
    const buffer = Buffer.concat([
      Buffer.from('RIFF', 'ascii'),
      Buffer.from([0x00, 0x00, 0x00, 0x00]), // chunk size, irrelevant here
      Buffer.from('WEBP', 'ascii'),
      Buffer.from('rest-of-file'),
    ]);
    expect(detectImageMimeType(buffer)).toBe('image/webp');
  });

  it('returns null for an unsupported type (e.g. PDF)', () => {
    expect(detectImageMimeType(Buffer.from('%PDF-1.4'))).toBeNull();
  });

  it('returns null for a RIFF container that is not WebP (e.g. WAV)', () => {
    const buffer = Buffer.concat([
      Buffer.from('RIFF', 'ascii'),
      Buffer.from([0x00, 0x00, 0x00, 0x00]),
      Buffer.from('WAVE', 'ascii'),
    ]);
    expect(detectImageMimeType(buffer)).toBeNull();
  });

  it('returns null for an empty buffer', () => {
    expect(detectImageMimeType(Buffer.alloc(0))).toBeNull();
  });

  it('returns null for a too-short buffer that cannot contain any signature', () => {
    expect(detectImageMimeType(Buffer.from([0xff, 0xd8]))).toBeNull();
  });
});
