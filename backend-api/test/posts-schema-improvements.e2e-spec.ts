import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PostStatus, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const E2E_DATABASE_URL =
  process.env.FEED_V3_E2E_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgresql://kiwi:kiwi_dev_password@localhost:5433/kiwi_marketplace?schema=public';

describe('Phase 3 Schema Improvements (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let categoryId: string;
  let ownerToken: string;
  let ownerId: string;
  let adminToken: string;
  let otherToken: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = E2E_DATABASE_URL;
    process.env.JWT_SECRET =
      process.env.JWT_SECRET ?? 'phase3-schema-e2e-secret';

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
      data: { name: '__phase3_schema_cat__', schema: {} },
    });
    categoryId = category.id;

    const passwordHash = await bcrypt.hash('password123', 10);

    const owner = await prisma.user.create({
      data: {
        phone: '__phase3_owner__',
        passwordHash,
        displayName: 'Owner',
      },
    });
    ownerId = owner.id;

    await prisma.user.create({
      data: {
        phone: '__phase3_admin__',
        passwordHash,
        displayName: 'Admin',
        role: UserRole.ADMIN,
      },
    });

    await prisma.user.create({
      data: {
        phone: '__phase3_other__',
        passwordHash,
        displayName: 'Other',
      },
    });

    ownerToken = await loginAs('__phase3_owner__');
    adminToken = await loginAs('__phase3_admin__');
    otherToken = await loginAs('__phase3_other__');
  });

  async function loginAs(phone: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ phone, password: 'password123' })
      .expect(200);

    const body = response.body as { accessToken: string };
    return body.accessToken;
  }

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  async function cleanup() {
    if (!prisma) return;

    await prisma.postImage.deleteMany({
      where: {
        post: {
          OR: [
            { category: { name: '__phase3_schema_cat__' } },
            {
              owner: {
                phone: {
                  in: [
                    '__phase3_owner__',
                    '__phase3_admin__',
                    '__phase3_other__',
                  ],
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
          { category: { name: '__phase3_schema_cat__' } },
          {
            owner: {
              phone: {
                in: [
                  '__phase3_owner__',
                  '__phase3_admin__',
                  '__phase3_other__',
                ],
              },
            },
          },
        ],
      },
    });
    await prisma.category.deleteMany({
      where: { name: '__phase3_schema_cat__' },
    });
    await prisma.user.deleteMany({
      where: {
        phone: {
          in: ['__phase3_owner__', '__phase3_admin__', '__phase3_other__'],
        },
      },
    });
  }

  // Deliberately far from any other e2e suite's seeded coordinates (see
  // `feed-v3-pagination.e2e-spec.ts`'s `CENTER`, ~37.5665/126.978, and
  // `feed-relevance-ranking.e2e-spec.ts`'s `CENTER`, ~-33.8688/151.2093) —
  // this suite doesn't test location-based feed behavior, so the exact
  // coordinates are arbitrary, but they must not coincide with a location
  // another suite's radius-scoped queries might scan when Jest runs
  // multiple *.e2e-spec.ts files concurrently against the same database.
  const ISOLATED_LOCATION = { latitude: 51.5074, longitude: -0.1278 };

  function createPostBody(overrides: Record<string, unknown> = {}) {
    return {
      categoryId,
      title: 'Phase3 post',
      price: 1000,
      description: 'desc',
      details: {},
      latitude: ISOLATED_LOCATION.latitude,
      longitude: ISOLATED_LOCATION.longitude,
      // A syntactically valid, correctly-namespaced key (Image Storage V1
      // spec) — this suite never uploads a real image or asserts on
      // `imageUrl` content, so a never-uploaded key is sufficient; ownership
      // verification is a pure `posts/{ownerId}/` prefix check with no R2
      // existence lookup.
      imageKeys: [`posts/${ownerId}/${randomUUID()}.webp`],
      ...overrides,
    };
  }

  async function createOwnedPost() {
    const response = await request(app.getHttpServer())
      .post('/posts')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send(createPostBody())
      .expect(201);

    return response.body as { id: string };
  }

  describe('latitude / longitude validation', () => {
    it('rejects create with out-of-range latitude', async () => {
      await request(app.getHttpServer())
        .post('/posts')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send(createPostBody({ latitude: 91 }))
        .expect(400);
    });

    it('rejects create with out-of-range longitude', async () => {
      await request(app.getHttpServer())
        .post('/posts')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send(createPostBody({ longitude: 181 }))
        .expect(400);
    });

    it('rejects update with out-of-range coordinates', async () => {
      const post = await createOwnedPost();

      await request(app.getHttpServer())
        .patch(`/posts/${post.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ latitude: -91, longitude: 126 })
        .expect(400);
    });
  });

  describe('atomic location update', () => {
    it('rejects update with only latitude', async () => {
      const post = await createOwnedPost();

      await request(app.getHttpServer())
        .patch(`/posts/${post.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ latitude: 37.5 })
        .expect(400);
    });

    it('rejects update with only longitude', async () => {
      const post = await createOwnedPost();

      await request(app.getHttpServer())
        .patch(`/posts/${post.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ longitude: 127 })
        .expect(400);
    });

    it('accepts update with both coordinates', async () => {
      const post = await createOwnedPost();

      const response = await request(app.getHttpServer())
        .patch(`/posts/${post.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ latitude: 37.5, longitude: 127.0 })
        .expect(200);

      const body = response.body as { latitude: number; longitude: number };
      expect(body.latitude).toBe(37.5);
      expect(body.longitude).toBe(127.0);
    });
  });

  describe('PostImage cascade delete', () => {
    it('hard-deleting a post removes its images', async () => {
      const post = await createOwnedPost();

      const before = await prisma.postImage.count({
        where: { postId: post.id },
      });
      expect(before).toBe(1);

      await prisma.post.delete({ where: { id: post.id } });

      const after = await prisma.postImage.count({
        where: { postId: post.id },
      });
      expect(after).toBe(0);
    });
  });

  describe('soft delete, restore, owner and admin visibility', () => {
    it('soft-deletes with status=DELETED and deletedAt set; hides from public', async () => {
      const post = await createOwnedPost();

      await request(app.getHttpServer())
        .delete(`/posts/${post.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(204);

      const row = await prisma.post.findUniqueOrThrow({
        where: { id: post.id },
      });
      expect(row.status).toBe(PostStatus.DELETED);
      expect(row.deletedAt).not.toBeNull();

      await request(app.getHttpServer()).get(`/posts/${post.id}`).expect(404);

      const feed = await request(app.getHttpServer())
        .get('/posts')
        .query({ limit: 50 })
        .expect(200);
      const feedBody = feed.body as { items: { id: string }[] };
      expect(feedBody.items.some((item) => item.id === post.id)).toBe(false);
    });

    it('owner can restore within 30 days', async () => {
      const post = await createOwnedPost();

      await request(app.getHttpServer())
        .delete(`/posts/${post.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(204);

      const restored = await request(app.getHttpServer())
        .post(`/posts/${post.id}/restorations`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(201);

      const body = restored.body as {
        status: PostStatus;
        deletedAt: string | null;
      };
      expect(body.status).toBe(PostStatus.ACTIVE);
      expect(body.deletedAt).toBeNull();

      await request(app.getHttpServer()).get(`/posts/${post.id}`).expect(200);
    });

    it('rejects restore after the 30-day window', async () => {
      const post = await createOwnedPost();

      await request(app.getHttpServer())
        .delete(`/posts/${post.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(204);

      await prisma.post.update({
        where: { id: post.id },
        data: {
          deletedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
        },
      });

      const response = await request(app.getHttpServer())
        .post(`/posts/${post.id}/restorations`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(403);

      expect((response.body as { message: string }).message).toBe(
        'Restore window has expired',
      );
    });

    it('GET /posts/me includes ACTIVE and restorable DELETED only', async () => {
      const active = await createOwnedPost();
      const restorable = await createOwnedPost();
      const expired = await createOwnedPost();

      await request(app.getHttpServer())
        .delete(`/posts/${restorable.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(204);

      await request(app.getHttpServer())
        .delete(`/posts/${expired.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(204);

      await prisma.post.update({
        where: { id: expired.id },
        data: {
          deletedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
        },
      });

      const mine = await request(app.getHttpServer())
        .get('/posts/me')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      const ids = (mine.body as { id: string }[]).map((p) => p.id);
      expect(ids).toContain(active.id);
      expect(ids).toContain(restorable.id);
      expect(ids).not.toContain(expired.id);
    });

    it('non-owner cannot restore', async () => {
      const post = await createOwnedPost();

      await request(app.getHttpServer())
        .delete(`/posts/${post.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(204);

      await request(app.getHttpServer())
        .post(`/posts/${post.id}/restorations`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(403);
    });

    it('ADMIN can GET a deleted post; public cannot', async () => {
      const post = await createOwnedPost();

      await request(app.getHttpServer())
        .delete(`/posts/${post.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(204);

      await request(app.getHttpServer()).get(`/posts/${post.id}`).expect(404);

      const adminView = await request(app.getHttpServer())
        .get(`/posts/${post.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const body = adminView.body as {
        status: PostStatus;
        deletedAt: string | null;
        owner: { id: string };
      };
      expect(body.status).toBe(PostStatus.DELETED);
      expect(body.deletedAt).not.toBeNull();
      expect(body.owner.id).toBe(ownerId);
    });
  });
});
