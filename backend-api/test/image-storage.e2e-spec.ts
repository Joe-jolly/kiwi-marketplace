import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

// R2 network boundary only: the real `StorageService` (content sniffing,
// `sharp` compression, key/URL building — all exercised for real below) runs
// unmodified; only the outbound S3-compatible `send()` call is intercepted,
// exactly like `src/storage/storage.service.spec.ts`'s unit-test mock. This
// is the Step 5 Decision Gate's chosen strategy — see the Step 5 report for
// the full comparison against a real/disposable R2 bucket.
const mockSend = jest
  .fn<Promise<void>, unknown[]>()
  .mockResolvedValue(undefined);

jest.mock('@aws-sdk/client-s3', () => {
  const actual: object = jest.requireActual('@aws-sdk/client-s3');
  return {
    ...actual,
    S3Client: jest.fn().mockImplementation(() => ({ send: mockSend })),
  };
});

import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import sharp from 'sharp';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const E2E_DATABASE_URL =
  process.env.IMAGE_STORAGE_E2E_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgresql://kiwi:kiwi_dev_password@localhost:5433/kiwi_marketplace?schema=public';

const R2_PUBLIC_BASE_URL = 'https://images.kiwi.example.com';

// Far from every other e2e suite's seeded coordinates (see
// `feed-v3-pagination.e2e-spec.ts`'s CENTER ~37.5665/126.978 and
// `feed-relevance-ranking.e2e-spec.ts`'s CENTER ~-33.8688/151.2093) and from
// `posts-schema-improvements.e2e-spec.ts`'s ISOLATED_LOCATION (~51.5074/
// -0.1278) — this suite's feed-path tests scope by `categoryId` too, but the
// distinct coordinates are cheap extra insurance against cross-suite
// contamination when Jest runs `*.e2e-spec.ts` files concurrently.
const LOCATION = { latitude: 35.6762, longitude: 139.6503 };

type PostImageDto = { imageUrl: string; displayOrder: number };
type PostResponse = { id: string; images: PostImageDto[] };
type FeedResponse = { items: { id: string; images: PostImageDto[] }[] };

describe('Image Storage V1 (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let categoryId: string;
  let ownerToken: string;
  let ownerId: string;
  let otherToken: string;
  let otherId: string;

  let jpegBuffer: Buffer;
  let pngBuffer: Buffer;
  let webpBuffer: Buffer;
  const pdfBuffer = Buffer.from('%PDF-1.4 not a real pdf, just plain bytes');

  beforeAll(async () => {
    process.env.DATABASE_URL = E2E_DATABASE_URL;
    process.env.JWT_SECRET =
      process.env.JWT_SECRET ?? 'image-storage-e2e-secret';
    // `StorageService`'s constructor reads these at app-bootstrap time; set
    // them before `compile()` so `getPublicUrl()` resolves to a predictable,
    // assertable URL for this suite.
    process.env.R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID ?? 'test-account-id';
    process.env.R2_ACCESS_KEY_ID =
      process.env.R2_ACCESS_KEY_ID ?? 'test-access-key';
    process.env.R2_SECRET_ACCESS_KEY =
      process.env.R2_SECRET_ACCESS_KEY ?? 'test-secret-key';
    process.env.R2_BUCKET_NAME =
      process.env.R2_BUCKET_NAME ?? 'kiwi-test-bucket';
    process.env.R2_PUBLIC_BASE_URL = R2_PUBLIC_BASE_URL;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    await cleanup();

    const category = await prisma.category.create({
      data: { name: '__image_storage_cat__', schema: {} },
    });
    categoryId = category.id;

    const passwordHash = await bcrypt.hash('password123', 10);

    const owner = await prisma.user.create({
      data: {
        phone: '__image_storage_owner__',
        passwordHash,
        displayName: 'Owner',
      },
    });
    ownerId = owner.id;

    const other = await prisma.user.create({
      data: {
        phone: '__image_storage_other__',
        passwordHash,
        displayName: 'Other',
      },
    });
    otherId = other.id;

    ownerToken = await loginAs('__image_storage_owner__');
    otherToken = await loginAs('__image_storage_other__');

    // Real, fully valid (if tiny) images of each supported format — content
    // sniffing and `sharp` compression run for real against these, only the
    // R2 network call is mocked.
    jpegBuffer = await sharp({
      create: {
        width: 4,
        height: 4,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .jpeg()
      .toBuffer();
    pngBuffer = await sharp({
      create: {
        width: 4,
        height: 4,
        channels: 3,
        background: { r: 0, g: 255, b: 0 },
      },
    })
      .png()
      .toBuffer();
    webpBuffer = await sharp({
      create: {
        width: 4,
        height: 4,
        channels: 4,
        background: { r: 0, g: 0, b: 255, alpha: 1 },
      },
    })
      .webp()
      .toBuffer();
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  beforeEach(() => {
    mockSend.mockClear();
  });

  async function loginAs(phone: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ phone, password: 'password123' })
      .expect(200);

    return (response.body as { accessToken: string }).accessToken;
  }

  async function cleanup() {
    if (!prisma) return;

    await prisma.postImage.deleteMany({
      where: {
        post: {
          OR: [
            { category: { name: '__image_storage_cat__' } },
            {
              owner: {
                phone: {
                  in: ['__image_storage_owner__', '__image_storage_other__'],
                },
              },
            },
          ],
        },
      },
    });
    await prisma.post.deleteMany({
      where: {
        OR: [
          { category: { name: '__image_storage_cat__' } },
          {
            owner: {
              phone: {
                in: ['__image_storage_owner__', '__image_storage_other__'],
              },
            },
          },
        ],
      },
    });
    await prisma.category.deleteMany({
      where: { name: '__image_storage_cat__' },
    });
    await prisma.user.deleteMany({
      where: {
        phone: { in: ['__image_storage_owner__', '__image_storage_other__'] },
      },
    });
  }

  /** A syntactically valid, correctly-namespaced key that was never actually
   * uploaded — cheap to construct, and sufficient for every create/update
   * test below, since ownership verification is a pure prefix check
   * (Ownership Rule #3) with no R2 existence lookup. */
  function ownedKey(userId: string = ownerId): string {
    return `posts/${userId}/${randomUUID()}.webp`;
  }

  function createPostBody(overrides: Record<string, unknown> = {}) {
    return {
      categoryId,
      title: 'Image storage post',
      price: 500,
      description: 'desc',
      details: {},
      latitude: LOCATION.latitude,
      longitude: LOCATION.longitude,
      imageKeys: [ownedKey()],
      ...overrides,
    };
  }

  async function createOwnedPost(
    overrides: Record<string, unknown> = {},
  ): Promise<PostResponse> {
    const response = await request(app.getHttpServer())
      .post('/posts')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send(createPostBody(overrides))
      .expect(201);

    return response.body as PostResponse;
  }

  function uploadImage(
    token: string | undefined,
    buffer: Buffer,
    filename: string,
    contentType: string,
  ) {
    const req = request(app.getHttpServer()).post('/posts/images');
    if (token) {
      req.set('Authorization', `Bearer ${token}`);
    }
    return req.attach('image', buffer, { filename, contentType });
  }

  // --- POST /posts/images -------------------------------------------------

  describe('POST /posts/images', () => {
    it('accepts a valid JPEG and returns 201 with a user-namespaced .webp key', async () => {
      const response = await uploadImage(
        ownerToken,
        jpegBuffer,
        'photo.jpg',
        'image/jpeg',
      ).expect(201);

      const body = response.body as { key: string };
      expect(body.key).toMatch(
        new RegExp(`^posts/${ownerId}/[0-9a-f-]+\\.webp$`),
      );
    });

    it('accepts a valid PNG and returns 201 with a .webp key', async () => {
      const response = await uploadImage(
        ownerToken,
        pngBuffer,
        'photo.png',
        'image/png',
      ).expect(201);

      expect((response.body as { key: string }).key).toMatch(/\.webp$/);
    });

    it('accepts a valid WebP and returns 201 with a .webp key', async () => {
      const response = await uploadImage(
        ownerToken,
        webpBuffer,
        'photo.webp',
        'image/webp',
      ).expect(201);

      expect((response.body as { key: string }).key).toMatch(/\.webp$/);
    });

    it('rejects an unauthenticated request with 401', async () => {
      await uploadImage(
        undefined,
        jpegBuffer,
        'photo.jpg',
        'image/jpeg',
      ).expect(401);
    });

    it('rejects a request with no file with 400', async () => {
      await request(app.getHttpServer())
        .post('/posts/images')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(400);
    });

    it('rejects an unsupported file type (PDF) with 400', async () => {
      await uploadImage(
        ownerToken,
        pdfBuffer,
        'file.pdf',
        'application/pdf',
      ).expect(400);
    });

    it('rejects an oversized file with 413', async () => {
      const oversized = Buffer.alloc(11 * 1024 * 1024, 1);
      await uploadImage(ownerToken, oversized, 'big.jpg', 'image/jpeg').expect(
        413,
      );
    }, 20000);

    it('sends only the compressed WebP buffer to R2, never the original', async () => {
      await uploadImage(
        ownerToken,
        jpegBuffer,
        'photo.jpg',
        'image/jpeg',
      ).expect(201);

      const putCalls = mockSend.mock.calls.filter(
        ([command]) => command instanceof PutObjectCommand,
      );
      expect(putCalls).toHaveLength(1);
      const command = putCalls[0][0] as PutObjectCommand;
      expect(command.input.ContentType).toBe('image/webp');
      expect(command.input.Body).not.toBe(jpegBuffer);
    });
  });

  // --- POST /posts with imageKeys -----------------------------------------

  describe('POST /posts with imageKeys', () => {
    it('creates a post with valid owned keys', async () => {
      const post = await createOwnedPost();
      expect(post.images).toHaveLength(1);
    });

    it('rejects 0 images (below the 1-image minimum)', async () => {
      await request(app.getHttpServer())
        .post('/posts')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send(createPostBody({ imageKeys: [] }))
        .expect(400);
    });

    it('accepts exactly 15 images', async () => {
      const keys = Array.from({ length: 15 }, () => ownedKey());
      const response = await request(app.getHttpServer())
        .post('/posts')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send(createPostBody({ imageKeys: keys }))
        .expect(201);

      expect((response.body as PostResponse).images).toHaveLength(15);
    });

    it('rejects more than 15 images', async () => {
      const keys = Array.from({ length: 16 }, () => ownedKey());
      await request(app.getHttpServer())
        .post('/posts')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send(createPostBody({ imageKeys: keys }))
        .expect(400);
    });

    it('rejects a key belonging to another user, with no partial post created', async () => {
      const before = await prisma.post.count({ where: { ownerId } });

      await request(app.getHttpServer())
        .post('/posts')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send(createPostBody({ imageKeys: [ownedKey(otherId)] }))
        .expect(400);

      const after = await prisma.post.count({ where: { ownerId } });
      expect(after).toBe(before);
    });

    it("rejects the other user attempting to attach the owner's own key to their post", async () => {
      const before = await prisma.post.count({ where: { ownerId: otherId } });

      await request(app.getHttpServer())
        .post('/posts')
        .set('Authorization', `Bearer ${otherToken}`)
        .send(createPostBody({ imageKeys: [ownedKey(ownerId)] }))
        .expect(400);

      const after = await prisma.post.count({ where: { ownerId: otherId } });
      expect(after).toBe(before);
    });

    // A syntactically valid, correctly-namespaced key that was never actually
    // uploaded (`ownedKey()`'s exact shape, reused by every other test in
    // this file) is accepted, not rejected — Ownership Rule #3 and ADR-005's
    // Design Decisions ("No R2 existence check on submitted keys") both
    // specify ownership as a pure `posts/{userId}/` namespace-prefix check
    // with no R2 lookup. The spec's Error Handling table originally
    // contradicted this (discovered in Step 5, resolved in Step 6 via
    // ADR-005's "Amendment: Ownership Verification Scope") — this test
    // pins down the now-consistent, spec-correct behavior.
    it('accepts a syntactically valid but never-uploaded key (ownership is prefix-only, by design)', async () => {
      const neverUploadedKey = ownedKey();

      const response = await request(app.getHttpServer())
        .post('/posts')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send(createPostBody({ imageKeys: [neverUploadedKey] }));

      expect(response.status).toBe(201);
    });

    it('preserves array order as displayOrder', async () => {
      const keys = [ownedKey(), ownedKey(), ownedKey()];
      const response = await request(app.getHttpServer())
        .post('/posts')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send(createPostBody({ imageKeys: keys }))
        .expect(201);

      const images = (response.body as PostResponse).images;
      const byOrder = [...images].sort(
        (a, b) => a.displayOrder - b.displayOrder,
      );
      expect(byOrder.map((image) => image.displayOrder)).toEqual([0, 1, 2]);
    });
  });

  // --- PATCH /posts/:id with imageKeys ------------------------------------

  describe('PATCH /posts/:id with imageKeys', () => {
    it('updates a post with valid owned keys, replacing the image set', async () => {
      const post = await createOwnedPost({ imageKeys: [ownedKey()] });
      const newKeys = [ownedKey(), ownedKey()];

      const response = await request(app.getHttpServer())
        .patch(`/posts/${post.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ imageKeys: newKeys })
        .expect(200);

      expect((response.body as PostResponse).images).toHaveLength(2);
    });

    it('leaves existing images unchanged when imageKeys is omitted', async () => {
      const post = await createOwnedPost({
        imageKeys: [ownedKey(), ownedKey()],
      });

      const response = await request(app.getHttpServer())
        .patch(`/posts/${post.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: 'Updated title only' })
        .expect(200);

      const body = response.body as PostResponse & { title: string };
      expect(body.title).toBe('Updated title only');
      expect(body.images).toHaveLength(post.images.length);
    });

    it('rejects an update where a submitted key belongs to another user', async () => {
      const post = await createOwnedPost();

      await request(app.getHttpServer())
        .patch(`/posts/${post.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ imageKeys: [ownedKey(otherId)] })
        .expect(400);
    });

    it('rejects more than 15 images on update', async () => {
      const post = await createOwnedPost();
      const keys = Array.from({ length: 16 }, () => ownedKey());

      await request(app.getHttpServer())
        .patch(`/posts/${post.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ imageKeys: keys })
        .expect(400);
    });

    it('deletes the R2 object for every removed key and its PostImage row, keeping the retained one', async () => {
      const keptKey = ownedKey();
      const removedKey = ownedKey();
      const post = await createOwnedPost({ imageKeys: [keptKey, removedKey] });

      await request(app.getHttpServer())
        .patch(`/posts/${post.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ imageKeys: [keptKey] })
        .expect(200);

      const deleteCalls = mockSend.mock.calls.filter(
        ([command]) => command instanceof DeleteObjectCommand,
      );
      const deletedKeys = deleteCalls.map(
        ([command]) => (command as DeleteObjectCommand).input.Key,
      );
      expect(deletedKeys).toContain(removedKey);
      expect(deletedKeys).not.toContain(keptKey);

      const remainingImages = await prisma.postImage.findMany({
        where: { postId: post.id },
      });
      expect(remainingImages.map((image) => image.imageUrl)).toEqual([keptKey]);
    });

    it('issues no R2 delete when imageKeys is omitted', async () => {
      const post = await createOwnedPost({ imageKeys: [ownedKey()] });

      await request(app.getHttpServer())
        .patch(`/posts/${post.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ price: 999 })
        .expect(200);

      const deleteCalls = mockSend.mock.calls.filter(
        ([command]) => command instanceof DeleteObjectCommand,
      );
      expect(deleteCalls).toHaveLength(0);
    });
  });

  // --- imageUrl resolution --------------------------------------------------

  describe('imageUrl resolution', () => {
    it('stores the raw R2 object key in PostImage.imageUrl, not a resolved URL', async () => {
      const key = ownedKey();
      const post = await createOwnedPost({ imageKeys: [key] });

      const row = await prisma.postImage.findFirstOrThrow({
        where: { postId: post.id },
      });
      expect(row.imageUrl).toBe(key);
    });

    it('GET /posts/:id resolves imageUrl to the public URL (Prisma-native detail path)', async () => {
      const key = ownedKey();
      const post = await createOwnedPost({ imageKeys: [key] });

      const response = await request(app.getHttpServer())
        .get(`/posts/${post.id}`)
        .expect(200);

      const body = response.body as PostResponse;
      expect(body.images[0].imageUrl).toBe(`${R2_PUBLIC_BASE_URL}/${key}`);
    });

    it('GET /posts/me resolves imageUrl to the public URL', async () => {
      const key = ownedKey();
      await createOwnedPost({ imageKeys: [key] });

      const response = await request(app.getHttpServer())
        .get('/posts/me')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      const posts = response.body as PostResponse[];
      const resolved = posts.flatMap((p) => p.images).map((i) => i.imageUrl);
      expect(resolved).toContain(`${R2_PUBLIC_BASE_URL}/${key}`);
    });

    it('GET /posts (no-location, Prisma-native feed path) resolves imageUrl', async () => {
      const key = ownedKey();
      await createOwnedPost({ imageKeys: [key] });

      const response = await request(app.getHttpServer())
        .get('/posts')
        .query({ categoryId, limit: 50 })
        .expect(200);

      const body = response.body as FeedResponse;
      const resolved = body.items
        .flatMap((item) => item.images)
        .map((image) => image.imageUrl);
      expect(resolved).toContain(`${R2_PUBLIC_BASE_URL}/${key}`);
    });

    it('GET /posts (location present, raw-SQL geo path) resolves imageUrl via hydrateImages', async () => {
      const key = ownedKey();
      await createOwnedPost({ imageKeys: [key] });

      const response = await request(app.getHttpServer())
        .get('/posts')
        .query({
          categoryId,
          latitude: LOCATION.latitude,
          longitude: LOCATION.longitude,
          radius: 5000,
          limit: 50,
        })
        .expect(200);

      const body = response.body as FeedResponse;
      const resolved = body.items
        .flatMap((item) => item.images)
        .map((image) => image.imageUrl);
      expect(resolved).toContain(`${R2_PUBLIC_BASE_URL}/${key}`);
    });

    it('GET /posts (sort=RELEVANCE, raw-SQL path) resolves imageUrl via hydrateImages', async () => {
      const key = ownedKey();
      await createOwnedPost({
        imageKeys: [key],
        title: 'zzqimagestoragerelevancemarker',
      });

      const response = await request(app.getHttpServer())
        .get('/posts')
        .query({
          categoryId,
          sort: 'RELEVANCE',
          search: 'zzqimagestoragerelevancemarker',
          limit: 50,
        })
        .expect(200);

      const body = response.body as FeedResponse;
      const resolved = body.items
        .flatMap((item) => item.images)
        .map((image) => image.imageUrl);
      expect(resolved).toContain(`${R2_PUBLIC_BASE_URL}/${key}`);
    });
  });

  // --- Full round trip: real upload -> create -> read ----------------------

  describe('full round trip', () => {
    it('upload -> create -> GET returns a directly-usable public URL for the uploaded key', async () => {
      const uploadResponse = await uploadImage(
        ownerToken,
        jpegBuffer,
        'photo.jpg',
        'image/jpeg',
      ).expect(201);
      const { key } = uploadResponse.body as { key: string };

      const post = await createOwnedPost({ imageKeys: [key] });

      const response = await request(app.getHttpServer())
        .get(`/posts/${post.id}`)
        .expect(200);

      const body = response.body as PostResponse;
      expect(body.images[0].imageUrl).toBe(`${R2_PUBLIC_BASE_URL}/${key}`);
    });
  });
});
