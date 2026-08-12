import { BadRequestException } from '@nestjs/common';
import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { StorageService } from './storage.service';

const mockSend = jest.fn<Promise<void>, unknown[]>();

jest.mock('@aws-sdk/client-s3', () => {
  const actual: object = jest.requireActual('@aws-sdk/client-s3');
  return {
    ...actual,
    S3Client: jest.fn().mockImplementation(() => ({
      send: mockSend,
    })),
  };
});

const mockToBuffer = jest.fn();
const mockWebp = jest.fn(() => ({ toBuffer: mockToBuffer }));
jest.mock('sharp', () =>
  jest.fn(() => ({
    webp: mockWebp,
  })),
);

// Real magic bytes, not mocked — `detectImageMimeType` is plain,
// dependency-free logic and is exercised for real here.
const JPEG_BUFFER = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff]),
  Buffer.from('rest-of-a-fake-jpeg'),
]);
const NON_IMAGE_BUFFER = Buffer.from('%PDF-1.4 not an image');

describe('StorageService', () => {
  const ORIGINAL_ENV = process.env;
  const WEBP_BUFFER = Buffer.from('compressed-webp-output');

  let service: StorageService;

  beforeEach(() => {
    jest.clearAllMocks();

    process.env = {
      ...ORIGINAL_ENV,
      R2_ACCOUNT_ID: 'test-account-id',
      R2_ACCESS_KEY_ID: 'test-access-key',
      R2_SECRET_ACCESS_KEY: 'test-secret-key',
      R2_BUCKET_NAME: 'kiwi-test-bucket',
      R2_PUBLIC_BASE_URL: 'https://images.kiwi.example.com/',
    };

    mockToBuffer.mockResolvedValue(WEBP_BUFFER);

    service = new StorageService();
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  describe('upload', () => {
    it('sends only the compressed WebP buffer to R2, never the original', async () => {
      await service.upload(JPEG_BUFFER, 'posts/user-1/abc.webp', 'image/jpeg');

      expect(mockSend).toHaveBeenCalledTimes(1);
      const command = mockSend.mock.calls[0][0] as PutObjectCommand;
      expect(command).toBeInstanceOf(PutObjectCommand);
      expect(command.input.Body).toBe(WEBP_BUFFER);
      expect(command.input.Body).not.toBe(JPEG_BUFFER);
    });

    it('issues PutObjectCommand with the expected bucket, key, and content type', async () => {
      await service.upload(JPEG_BUFFER, 'posts/user-1/abc.webp', 'image/jpeg');

      const command = mockSend.mock.calls[0][0] as PutObjectCommand;
      expect(command.input).toEqual({
        Bucket: 'kiwi-test-bucket',
        Key: 'posts/user-1/abc.webp',
        Body: WEBP_BUFFER,
        ContentType: 'image/webp',
      });
    });

    it('compresses the original buffer via sharp before uploading', async () => {
      const sharpMock: unknown = jest.requireMock('sharp');

      await service.upload(JPEG_BUFFER, 'posts/user-1/abc.webp', 'image/jpeg');

      expect(sharpMock as jest.Mock).toHaveBeenCalledWith(JPEG_BUFFER);
      expect(mockWebp).toHaveBeenCalledTimes(1);
      expect(mockToBuffer).toHaveBeenCalledTimes(1);
    });

    it('rejects a buffer whose sniffed content is not an allowed image type', async () => {
      await expect(
        service.upload(
          NON_IMAGE_BUFFER,
          'posts/user-1/abc.webp',
          'application/pdf',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('rejects when the declared content type does not match the sniffed content type', async () => {
      await expect(
        service.upload(JPEG_BUFFER, 'posts/user-1/abc.webp', 'image/png'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('issues DeleteObjectCommand with the expected bucket and key', async () => {
      await service.delete('posts/user-1/abc.webp');

      expect(mockSend).toHaveBeenCalledTimes(1);
      const command = mockSend.mock.calls[0][0] as DeleteObjectCommand;
      expect(command).toBeInstanceOf(DeleteObjectCommand);
      expect(command.input).toEqual({
        Bucket: 'kiwi-test-bucket',
        Key: 'posts/user-1/abc.webp',
      });
    });
  });

  describe('getPublicUrl', () => {
    it('resolves a key to the configured public base URL, without a double slash', () => {
      expect(service.getPublicUrl('posts/user-1/abc.webp')).toBe(
        'https://images.kiwi.example.com/posts/user-1/abc.webp',
      );
    });
  });
});
