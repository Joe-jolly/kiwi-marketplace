import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PostStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { encodeKeysetCursor } from '../src/common/pagination/keyset-cursor.util';
import { PrismaService } from '../src/prisma/prisma.service';

const E2E_DATABASE_URL =
  process.env.FAVORITES_E2E_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgresql://kiwi:kiwi_dev_password@localhost:5433/kiwi_marketplace?schema=public';

describe('Phase 9 Favorites (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let categoryId: string;
  let ownerToken: string;
  let ownerId: string;
  let viewerToken: string;
  let viewerId: string;

  // Cape Town — distinct from every other e2e suite's seeded coordinates
  // (see `posts-schema-improvements.e2e-spec.ts`'s comment for the full
  // list); this suite never runs a location-scoped feed query itself, but
  // its ACTIVE test posts still exist in the shared table while other
  // suites' e2e specs may run concurrently.
  const ISOLATED_LOCATION = { latitude: -33.9249, longitude: 18.4241 };

  beforeAll(async () => {
    process.env.DATABASE_URL = E2E_DATABASE_URL;
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'favorites-e2e-secret';

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
      data: { name: '__favorites_e2e_cat__', schema: {} },
    });
    categoryId = category.id;

    const passwordHash = await bcrypt.hash('password123', 10);

    const owner = await prisma.user.create({
      data: {
        phone: '__favorites_owner__',
        passwordHash,
        displayName: 'Owner',
      },
    });
    ownerId = owner.id;

    const viewer = await prisma.user.create({
      data: {
        phone: '__favorites_viewer__',
        passwordHash,
        displayName: 'Viewer',
      },
    });
    viewerId = viewer.id;

    ownerToken = await loginAs('__favorites_owner__');
    viewerToken = await loginAs('__favorites_viewer__');
  });

  async function loginAs(phone: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ phone, password: 'password123' })
      .expect(200);

    return (response.body as { accessToken: string }).accessToken;
  }

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  async function cleanup() {
    if (!prisma) return;

    await prisma.favorite.deleteMany({
      where: {
        OR: [
          { post: { category: { name: '__favorites_e2e_cat__' } } },
          {
            user: {
              phone: { in: ['__favorites_owner__', '__favorites_viewer__'] },
            },
          },
        ],
      },
    });
    await prisma.postImage.deleteMany({
      where: { post: { category: { name: '__favorites_e2e_cat__' } } },
    });
    await prisma.post.deleteMany({
      where: { category: { name: '__favorites_e2e_cat__' } },
    });
    await prisma.category.deleteMany({
      where: { name: '__favorites_e2e_cat__' },
    });
    await prisma.user.deleteMany({
      where: { phone: { in: ['__favorites_owner__', '__favorites_viewer__'] } },
    });
  }

  function createPostBody(overrides: Record<string, unknown> = {}) {
    return {
      categoryId,
      title: 'Favorites post',
      price: 500,
      description: 'desc',
      details: {},
      latitude: ISOLATED_LOCATION.latitude,
      longitude: ISOLATED_LOCATION.longitude,
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

  describe('POST /posts/:id/favorites', () => {
    it('creates a favorite', async () => {
      const post = await createOwnedPost();

      const response = await request(app.getHttpServer())
        .post(`/posts/${post.id}/favorites`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(200);

      const body = response.body as { postId: string; createdAt: string };
      expect(body.postId).toBe(post.id);
      expect(body.createdAt).toBeDefined();

      const row = await prisma.favorite.findUnique({
        where: { userId_postId: { userId: viewerId, postId: post.id } },
      });
      expect(row).not.toBeNull();
    });

    it('is idempotent: repeat favorite does not create a duplicate', async () => {
      const post = await createOwnedPost();

      await request(app.getHttpServer())
        .post(`/posts/${post.id}/favorites`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .post(`/posts/${post.id}/favorites`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(200);

      const count = await prisma.favorite.count({
        where: { userId: viewerId, postId: post.id },
      });
      expect(count).toBe(1);
    });

    it('rejects unauthenticated requests', async () => {
      const post = await createOwnedPost();

      await request(app.getHttpServer())
        .post(`/posts/${post.id}/favorites`)
        .expect(401);
    });

    it('404s favoriting a nonexistent post', async () => {
      await request(app.getHttpServer())
        .post(`/posts/${randomUUID()}/favorites`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(404);
    });

    it('404s favoriting a PAUSED post (hidden from public, per findOne())', async () => {
      const post = await createOwnedPost();
      await prisma.post.update({
        where: { id: post.id },
        data: { status: PostStatus.PAUSED },
      });

      await request(app.getHttpServer())
        .post(`/posts/${post.id}/favorites`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(404);
    });

    it('allows favoriting a RESERVED post (remains publicly visible)', async () => {
      const post = await createOwnedPost();
      await prisma.post.update({
        where: { id: post.id },
        data: { status: PostStatus.RESERVED },
      });

      await request(app.getHttpServer())
        .post(`/posts/${post.id}/favorites`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(200);
    });
  });

  describe('DELETE /posts/:id/favorites', () => {
    it('removes a favorite', async () => {
      const post = await createOwnedPost();
      await request(app.getHttpServer())
        .post(`/posts/${post.id}/favorites`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .delete(`/posts/${post.id}/favorites`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(204);

      const row = await prisma.favorite.findUnique({
        where: { userId_postId: { userId: viewerId, postId: post.id } },
      });
      expect(row).toBeNull();
    });

    it('is idempotent: removing a never-favorited post still succeeds', async () => {
      const post = await createOwnedPost();

      await request(app.getHttpServer())
        .delete(`/posts/${post.id}/favorites`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(204);
      await request(app.getHttpServer())
        .delete(`/posts/${post.id}/favorites`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(204);
    });

    it('removing a favorite on a since-deleted post still succeeds', async () => {
      const post = await createOwnedPost();
      await request(app.getHttpServer())
        .post(`/posts/${post.id}/favorites`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(200);

      await prisma.post.update({
        where: { id: post.id },
        data: { status: PostStatus.DELETED, deletedAt: new Date() },
      });

      await request(app.getHttpServer())
        .delete(`/posts/${post.id}/favorites`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(204);
    });

    it('rejects unauthenticated requests', async () => {
      const post = await createOwnedPost();

      await request(app.getHttpServer())
        .delete(`/posts/${post.id}/favorites`)
        .expect(401);
    });
  });

  describe('GET /favorites', () => {
    it('lists favorited posts sorted by favorited-at desc, with full post detail', async () => {
      const first = await createOwnedPost();
      const second = await createOwnedPost();

      await request(app.getHttpServer())
        .post(`/posts/${first.id}/favorites`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .post(`/posts/${second.id}/favorites`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(200);

      const response = await request(app.getHttpServer())
        .get('/favorites')
        .set('Authorization', `Bearer ${viewerToken}`)
        .query({ limit: 50 })
        .expect(200);

      const body = response.body as {
        items: { id: string; title: string; isAvailable: boolean }[];
        nextCursor: string | null;
        hasNextPage: boolean;
      };

      const ids = body.items.map((p) => p.id);
      expect(ids.indexOf(second.id)).toBeLessThan(ids.indexOf(first.id));
      const found = body.items.find((p) => p.id === second.id);
      expect(found?.title).toBe('Favorites post');
      expect(found?.isAvailable).toBe(true);
    });

    it('is cursor-paginated (favorite createdAt desc, postId desc)', async () => {
      // Earlier tests in this file already favorited other posts for
      // `viewerId`, so this user has more favorites history than just
      // a/b/c — the assertions below only rely on relative ordering
      // between them, not on these being the viewer's only favorites.
      const a = await createOwnedPost();
      const b = await createOwnedPost();
      const c = await createOwnedPost();

      for (const post of [a, b, c]) {
        await request(app.getHttpServer())
          .post(`/posts/${post.id}/favorites`)
          .set('Authorization', `Bearer ${viewerToken}`)
          .expect(200);
      }

      const page1 = await request(app.getHttpServer())
        .get('/favorites')
        .set('Authorization', `Bearer ${viewerToken}`)
        .query({ limit: 2 })
        .expect(200);

      const body1 = page1.body as {
        items: { id: string }[];
        nextCursor: string | null;
        hasNextPage: boolean;
      };
      expect(body1.items).toHaveLength(2);
      expect(body1.items.map((p) => p.id)).toEqual([c.id, b.id]);
      expect(body1.hasNextPage).toBe(true);
      expect(body1.nextCursor).not.toBeNull();

      const page2 = await request(app.getHttpServer())
        .get('/favorites')
        .set('Authorization', `Bearer ${viewerToken}`)
        .query({ limit: 2, cursor: body1.nextCursor })
        .expect(200);

      const body2 = page2.body as {
        items: { id: string }[];
        hasNextPage: boolean;
      };
      // `a` must be the immediate next favorite after `b` — no other
      // favorite could have been created strictly between them in time —
      // but earlier tests' favorites are still older still, so pagination
      // continues beyond this page rather than terminating here.
      expect(body2.items[0]?.id).toBe(a.id);
      expect(body2.hasNextPage).toBe(true);
    });

    it('keeps a favorite whose post became PAUSED, flagged isAvailable:false', async () => {
      const post = await createOwnedPost();
      await request(app.getHttpServer())
        .post(`/posts/${post.id}/favorites`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(200);

      await prisma.post.update({
        where: { id: post.id },
        data: { status: PostStatus.PAUSED },
      });

      const response = await request(app.getHttpServer())
        .get('/favorites')
        .set('Authorization', `Bearer ${viewerToken}`)
        .query({ limit: 50 })
        .expect(200);

      const body = response.body as {
        items: { id: string; status: PostStatus; isAvailable: boolean }[];
      };
      const item = body.items.find((p) => p.id === post.id);
      expect(item).toBeDefined();
      expect(item?.status).toBe(PostStatus.PAUSED);
      expect(item?.isAvailable).toBe(false);
    });

    it('rejects a cursor issued for a different endpoint (purpose-scoped)', async () => {
      const wrongScopeCursor = encodeKeysetCursor(
        'posts-mine',
        new Date(),
        randomUUID(),
      );

      await request(app.getHttpServer())
        .get('/favorites')
        .set('Authorization', `Bearer ${viewerToken}`)
        .query({ cursor: wrongScopeCursor })
        .expect(400);
    });

    it('rejects an invalid cursor', async () => {
      await request(app.getHttpServer())
        .get('/favorites')
        .set('Authorization', `Bearer ${viewerToken}`)
        .query({ cursor: 'not-a-valid-cursor' })
        .expect(400);
    });

    it('rejects unauthenticated requests', async () => {
      await request(app.getHttpServer()).get('/favorites').expect(401);
    });
  });

  describe('cascade delete', () => {
    it('hard-deleting a post removes its favorites', async () => {
      const post = await createOwnedPost();
      await request(app.getHttpServer())
        .post(`/posts/${post.id}/favorites`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(200);

      await prisma.post.delete({ where: { id: post.id } });

      const row = await prisma.favorite.findUnique({
        where: { userId_postId: { userId: viewerId, postId: post.id } },
      });
      expect(row).toBeNull();
    });
  });
});
