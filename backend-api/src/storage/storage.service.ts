import { BadRequestException, Injectable } from '@nestjs/common';
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { detectImageMimeType } from './image-signature.util';

/** Every object Kiwi writes to R2 is WebP, regardless of input format
 * (Technical Constitution §17: "Compressed files should be stored.
 * Original files should not be stored."). */
const STORED_CONTENT_TYPE = 'image/webp';

/**
 * Thin wrapper around Cloudflare R2's S3-compatible API plus the mandatory
 * WebP compression step, per ADR-005 (Image Storage Architecture) and
 * `docs/specifications/image-storage-v1-spec.md`. This is shared
 * infrastructure — outside feature folders, parallel to `PrismaService` —
 * with no post-domain knowledge (ownership, the 15-image cap, etc. remain in
 * `PostsService`).
 */
@Injectable()
export class StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;

  constructor() {
    this.bucket = process.env.R2_BUCKET_NAME as string;
    this.publicBaseUrl = (process.env.R2_PUBLIC_BASE_URL as string)?.replace(
      /\/+$/,
      '',
    );
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID as string,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY as string,
      },
    });
  }

  /**
   * Validates the buffer's real content (via magic-byte sniffing, never the
   * caller-declared `contentType` alone), compresses/converts it to WebP,
   * and writes only that compressed result to R2. The original buffer is
   * never sent to R2 — satisfies Image Storage V1 spec's Validation Rules
   * #2 and Storage Rule ("original files should not be stored").
   */
  async upload(
    buffer: Buffer,
    key: string,
    contentType: string,
  ): Promise<void> {
    const detectedMimeType = detectImageMimeType(buffer);

    if (!detectedMimeType) {
      throw new BadRequestException('Unsupported image type');
    }

    if (detectedMimeType !== contentType) {
      // A mismatch between the declared and the sniffed type is itself
      // suspicious — never trust the frontend (API Constitution §27).
      throw new BadRequestException(
        'Declared content type does not match file content',
      );
    }

    const webpBuffer = await sharp(buffer).webp().toBuffer();

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: webpBuffer,
        ContentType: STORED_CONTENT_TYPE,
      }),
    );
  }

  /** Deletes the given object from R2. Used when a post's image set no
   * longer references a previously-stored key (Image Storage V1 spec,
   * Storage / Deletion Rule). */
  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }

  /** Resolves an object key to the fully-usable public URL clients receive
   * in feed/detail responses (Image Storage V1 spec, Response Format). */
  getPublicUrl(key: string): string {
    return `${this.publicBaseUrl}/${key}`;
  }
}
