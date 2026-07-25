import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PostStatus, Prisma } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { encodeCursor } from '../src/posts/feed/cursor.util';
import { SortOption } from '../src/posts/feed/sort-option.enum';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Feed Engine V3 — Definition of Done §3 correctness harness.
 *
 * Runs against a real PostGIS-backed database. Expected id sets / order are
 * computed independently of PostsService / GeoFeedQueryBuilder (Prisma + a
 * direct ST_Distance reference query), then compared to full pagination
 * walks through the public HTTP API.
 */

const E2E_DATABASE_URL =
  process.env.FEED_V3_E2E_DATABASE_URL ??
  'postgresql://kiwi:kiwi_dev_password@localhost:5433/kiwi_marketplace?schema=public';

const CENTER = { latitude: 37.5665, longitude: 126.978 };
const RADIUS_METERS = 2000;

type FeedItem = { id: string; title: string; price: number; createdAt: string };
type FeedResponse = {
  items: FeedItem[];
  nextCursor: string | null;
  hasNextPage: boolean;
};

type SeedPost = {
  key: string;
  title: string;
  price: number;
  dLat: number;
  category: 'A' | 'B';
  createdAt: Date;
  status?: PostStatus;
};

describe('Feed Engine V3 pagination (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let categoryAId: string;
  let categoryBId: string;
  let userId: string;
  const idsByKey = new Map<string, string>();

  const seedPosts: SeedPost[] = [
    // Within 2km (approx distances noted in comments)
    {
      key: 'p1',
      title: 'Alpha bike',
      price: 100,
      dLat: 0,
      category: 'A',
      createdAt: new Date('2026-01-07T12:00:00.000Z'),
    }, // ~0m
    {
      key: 'p2',
      title: 'Beta chair',
      price: 200,
      dLat: 0.001,
      category: 'A',
      createdAt: new Date('2026-01-06T12:00:00.000Z'),
    }, // ~111m
    {
      key: 'p3',
      title: 'Gamma bike',
      price: 50,
      dLat: 0.002,
      category: 'A',
      createdAt: new Date('2026-01-05T12:00:00.000Z'),
    }, // ~222m
    {
      key: 'p4',
      title: 'Delta table',
      price: 300,
      dLat: 0.005,
      category: 'A',
      createdAt: new Date('2026-01-04T12:00:00.000Z'),
    }, // ~555m
    {
      key: 'p5',
      title: 'Epsilon bike',
      price: 150,
      dLat: 0.007,
      category: 'B',
      createdAt: new Date('2026-01-03T12:00:00.000Z'),
    }, // ~777m
    {
      key: 'p6',
      title: 'Zeta lamp',
      price: 250,
      dLat: 0.009,
      category: 'A',
      createdAt: new Date('2026-01-02T12:00:00.000Z'),
    }, // ~1000m
    {
      key: 'p7',
      title: 'Eta bike',
      price: 50,
      dLat: 0.012,
      category: 'A',
      createdAt: new Date('2026-01-01T12:00:00.000Z'),
    }, // ~1333m — same price as p3 for id tie-break
    // Outside 2km
    {
      key: 'p8',
      title: 'Outside bike',
      price: 10,
      dLat: 0.05,
      category: 'A',
      createdAt: new Date('2026-01-08T12:00:00.000Z'),
    }, // ~5560m
    // Soft-deleted, within radius — must never appear
    {
      key: 'p9',
      title: 'Deleted bike',
      price: 1,
      dLat: 0.0005,
      category: 'A',
      createdAt: new Date('2026-01-09T12:00:00.000Z'),
      status: PostStatus.DELETED,
    },
  ];

  beforeAll(async () => {
    process.env.DATABASE_URL = E2E_DATABASE_URL;
    process.env.JWT_SECRET =
      process.env.JWT_SECRET ?? 'feed-v3-e2e-test-secret';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Mirror production ValidationPipe so DTO regression cases exercise the
    // same validation path as main.ts.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    await seed();
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  async function seed() {
    await cleanup();

    const categoryA = await prisma.category.create({
      data: { name: '__feed_v3_e2e_cat_a__', schema: {} },
    });
    const categoryB = await prisma.category.create({
      data: { name: '__feed_v3_e2e_cat_b__', schema: {} },
    });
    categoryAId = categoryA.id;
    categoryBId = categoryB.id;

    const user = await prisma.user.create({
      data: {
        phone: '__feed_v3_e2e_phone__',
        passwordHash: 'x',
        displayName: 'Feed V3 E2E Seller',
      },
    });
    userId = user.id;

    for (const post of seedPosts) {
      const created = await prisma.post.create({
        data: {
          ownerId: userId,
          categoryId: post.category === 'A' ? categoryAId : categoryBId,
          title: post.title,
          price: post.price,
          description: `Description for ${post.key}`,
          details: {},
          latitude: CENTER.latitude + post.dLat,
          longitude: CENTER.longitude,
          status: post.status ?? PostStatus.ACTIVE,
          createdAt: post.createdAt,
        },
      });
      idsByKey.set(post.key, created.id);
    }
  }

  async function cleanup() {
    if (!prisma) {
      return;
    }

    await prisma.postImage.deleteMany({
      where: {
        post: {
          OR: [
            { category: { name: { startsWith: '__feed_v3_e2e_' } } },
            { owner: { phone: '__feed_v3_e2e_phone__' } },
          ],
        },
      },
    });
    await prisma.post.deleteMany({
      where: {
        OR: [
          { category: { name: { startsWith: '__feed_v3_e2e_' } } },
          { owner: { phone: '__feed_v3_e2e_phone__' } },
        ],
      },
    });
    await prisma.category.deleteMany({
      where: { name: { startsWith: '__feed_v3_e2e_' } },
    });
    await prisma.user.deleteMany({
      where: { phone: '__feed_v3_e2e_phone__' },
    });
  }

  function idOf(key: string): string {
    const id = idsByKey.get(key);
    if (!id) {
      throw new Error(`Unknown seed key: ${key}`);
    }
    return id;
  }

  async function walkFeed(query: Record<string, string | number>): Promise<{
    ids: string[];
    pages: FeedResponse[];
  }> {
    const ids: string[] = [];
    const pages: FeedResponse[] = [];
    let cursor: string | undefined;

    for (let page = 0; page < 50; page++) {
      const params: Record<string, string | number> = { ...query };
      if (cursor) {
        params.cursor = cursor;
      }

      const response = await request(app.getHttpServer())
        .get('/posts')
        .query(params)
        .expect(200);

      const body = response.body as FeedResponse;
      pages.push(body);
      ids.push(...body.items.map((item) => item.id));

      if (!body.hasNextPage) {
        expect(body.nextCursor).toBeNull();
        break;
      }

      expect(body.nextCursor).toEqual(expect.any(String));
      cursor = body.nextCursor!;
    }

    return { ids, pages };
  }

  /**
   * Independent reference: ACTIVE posts matching optional category/search,
   * optionally restricted by PostGIS radius, then sorted in-process by the
   * ADR-004 tie-break rules. Does not call PostsService or GeoFeedQueryBuilder.
   */
  async function expectedIds(options: {
    sort: SortOption;
    categoryId?: string;
    search?: string;
    location?: { latitude: number; longitude: number; radius: number };
  }): Promise<string[]> {
    const rows = await prisma.$queryRaw<
      {
        id: string;
        price: number;
        createdAt: Date;
        distanceMeters: number | null;
      }[]
    >(Prisma.sql`
      SELECT
        "Post"."id" AS "id",
        "Post"."price" AS "price",
        "Post"."createdAt" AS "createdAt",
        ${
          options.location
            ? Prisma.sql`ST_Distance(
                "Post"."location",
                ST_SetSRID(
                  ST_MakePoint(${options.location.longitude}, ${options.location.latitude}),
                  4326
                )::geography
              )`
            : Prisma.sql`NULL`
        } AS "distanceMeters"
      FROM "Post"
      INNER JOIN "Category" ON "Category"."id" = "Post"."categoryId"
      WHERE "Post"."status" = ${PostStatus.ACTIVE}::"PostStatus"
        ${
          options.categoryId
            ? Prisma.sql`AND "Post"."categoryId" = ${options.categoryId}`
            : Prisma.empty
        }
        ${
          options.search
            ? Prisma.sql`AND (
                "Post"."title" ILIKE ${'%' + options.search + '%'}
                OR "Post"."description" ILIKE ${'%' + options.search + '%'}
                OR "Category"."name" ILIKE ${'%' + options.search + '%'}
              )`
            : Prisma.empty
        }
        ${
          options.location
            ? Prisma.sql`AND ST_DWithin(
                "Post"."location",
                ST_SetSRID(
                  ST_MakePoint(${options.location.longitude}, ${options.location.latitude}),
                  4326
                )::geography,
                ${options.location.radius}
              )`
            : Prisma.empty
        }
    `);

    const compareId = (a: string, b: string, direction: 'asc' | 'desc') => {
      if (a === b) return 0;
      const asc = a < b ? -1 : 1;
      return direction === 'asc' ? asc : -asc;
    };

    const sorted = [...rows].sort((a, b) => {
      switch (options.sort) {
        case SortOption.NEWEST: {
          const byDate =
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          return byDate !== 0 ? byDate : compareId(a.id, b.id, 'desc');
        }
        case SortOption.PRICE_ASC: {
          if (a.price !== b.price) return Number(a.price) - Number(b.price);
          return compareId(a.id, b.id, 'asc');
        }
        case SortOption.PRICE_DESC: {
          if (a.price !== b.price) return Number(b.price) - Number(a.price);
          return compareId(a.id, b.id, 'desc');
        }
        case SortOption.NEAREST: {
          const da =
            a.distanceMeters == null
              ? Number.POSITIVE_INFINITY
              : Number(a.distanceMeters);
          const db =
            b.distanceMeters == null
              ? Number.POSITIVE_INFINITY
              : Number(b.distanceMeters);
          if (da !== db) return da - db;
          return compareId(a.id, b.id, 'asc');
        }
      }
    });

    return sorted.map((row) => row.id);
  }

  function assertWalkMatchesExpected(
    walkedIds: string[],
    expected: string[],
    label: string,
  ) {
    expect({ label, unique: new Set(walkedIds).size }).toEqual({
      label,
      unique: walkedIds.length,
    });
    expect({ label, walkedIds }).toEqual({ label, walkedIds: expected });
  }

  // -------------------------------------------------------------------------
  // Full pagination walks — every sort mode, no-location path
  // -------------------------------------------------------------------------

  describe('no-location path', () => {
    it.each([
      SortOption.NEWEST,
      SortOption.PRICE_ASC,
      SortOption.PRICE_DESC,
    ] as const)(
      'full walk sort=%s — no skip, no duplicate, deterministic order',
      async (sort) => {
        const expected = await expectedIds({ sort });
        const { ids, pages } = await walkFeed({ sort, limit: 2 });

        assertWalkMatchesExpected(ids, expected, `no-location ${sort}`);
        expect(pages.length).toBeGreaterThan(1);
        expect(ids).not.toContain(idOf('p9'));
      },
    );
  });

  // -------------------------------------------------------------------------
  // Full pagination walks — every sort mode, location path
  // -------------------------------------------------------------------------

  describe('location path', () => {
    const locationQuery = {
      latitude: CENTER.latitude,
      longitude: CENTER.longitude,
      radius: RADIUS_METERS,
    };

    it.each([
      SortOption.NEWEST,
      SortOption.PRICE_ASC,
      SortOption.PRICE_DESC,
      SortOption.NEAREST,
    ] as const)(
      'full walk sort=%s — no skip, no duplicate, deterministic order',
      async (sort) => {
        const expected = await expectedIds({ sort, location: locationQuery });
        const { ids, pages } = await walkFeed({
          sort,
          limit: 2,
          ...locationQuery,
        });

        assertWalkMatchesExpected(ids, expected, `location ${sort}`);
        expect(pages.length).toBeGreaterThan(1);
        expect(ids).not.toContain(idOf('p8'));
        expect(ids).not.toContain(idOf('p9'));
        for (const page of pages) {
          for (const item of page.items) {
            expect(item).not.toHaveProperty('distance');
          }
        }
      },
    );
  });

  // -------------------------------------------------------------------------
  // search + category + location together
  // -------------------------------------------------------------------------

  describe('search + category + location', () => {
    it('full walk with combined filters matches independent reference', async () => {
      const location = {
        latitude: CENTER.latitude,
        longitude: CENTER.longitude,
        radius: RADIUS_METERS,
      };
      const expected = await expectedIds({
        sort: SortOption.NEAREST,
        categoryId: categoryAId,
        search: 'bike',
        location,
      });

      // Within radius + cat A + title/description containing "bike":
      // p1, p3, p7 (p5 is cat B; p8 is outside; p9 deleted)
      expect([...expected].sort()).toEqual(
        [idOf('p1'), idOf('p3'), idOf('p7')].sort(),
      );

      const { ids } = await walkFeed({
        sort: SortOption.NEAREST,
        limit: 2,
        categoryId: categoryAId,
        search: 'bike',
        ...location,
      });

      assertWalkMatchesExpected(
        ids,
        expected,
        'search+category+location NEAREST',
      );
    });
  });

  // -------------------------------------------------------------------------
  // Boundary cases
  // -------------------------------------------------------------------------

  describe('boundary cases', () => {
    it('empty result set', async () => {
      // Center far from every seeded post so the radius contains nothing.
      const response = await request(app.getHttpServer())
        .get('/posts')
        .query({
          sort: SortOption.NEAREST,
          limit: 10,
          latitude: -45.0,
          longitude: 170.0,
          radius: 100,
        })
        .expect(200);

      const body = response.body as FeedResponse;
      expect(body.items).toEqual([]);
      expect(body.hasNextPage).toBe(false);
      expect(body.nextCursor).toBeNull();
    });

    it('exactly one page of results (hasNextPage=false)', async () => {
      const location = {
        latitude: CENTER.latitude,
        longitude: CENTER.longitude,
        radius: RADIUS_METERS,
      };
      const expected = await expectedIds({
        sort: SortOption.NEWEST,
        categoryId: categoryBId,
        location,
      });
      // Only p5 is in category B within radius
      expect(expected).toEqual([idOf('p5')]);

      const { ids, pages } = await walkFeed({
        sort: SortOption.NEWEST,
        limit: 10,
        categoryId: categoryBId,
        ...location,
      });

      expect(pages).toHaveLength(1);
      expect(pages[0].hasNextPage).toBe(false);
      assertWalkMatchesExpected(ids, expected, 'single-page');
    });

    it('exactly limit+1 matching rows requires a second page', async () => {
      // Category B has exactly 1 post; use a filter with exactly 3 ACTIVE
      // in-radius cat-A posts whose titles contain "bike": p1, p3, p7.
      // With limit=2 that is limit+1 → hasNextPage on page 1.
      const location = {
        latitude: CENTER.latitude,
        longitude: CENTER.longitude,
        radius: RADIUS_METERS,
      };
      const expected = await expectedIds({
        sort: SortOption.PRICE_ASC,
        categoryId: categoryAId,
        search: 'bike',
        location,
      });
      expect(expected).toHaveLength(3);

      const { ids, pages } = await walkFeed({
        sort: SortOption.PRICE_ASC,
        limit: 2,
        categoryId: categoryAId,
        search: 'bike',
        ...location,
      });

      expect(pages).toHaveLength(2);
      expect(pages[0].items).toHaveLength(2);
      expect(pages[0].hasNextPage).toBe(true);
      expect(pages[1].items).toHaveLength(1);
      expect(pages[1].hasNextPage).toBe(false);
      assertWalkMatchesExpected(ids, expected, 'limit+1');
    });

    it('multi-page dataset walks to completion', async () => {
      const location = {
        latitude: CENTER.latitude,
        longitude: CENTER.longitude,
        radius: RADIUS_METERS,
      };
      const expected = await expectedIds({
        sort: SortOption.NEAREST,
        location,
      });
      // p1–p7 within radius; p8 outside; p9 deleted
      expect(expected).toHaveLength(7);

      const { ids, pages } = await walkFeed({
        sort: SortOption.NEAREST,
        limit: 2,
        ...location,
      });

      expect(pages.length).toBeGreaterThanOrEqual(4);
      assertWalkMatchesExpected(ids, expected, 'multi-page NEAREST');
    });
  });

  // -------------------------------------------------------------------------
  // Validation / regression cases (DoD §3)
  // -------------------------------------------------------------------------

  describe('validation regressions', () => {
    it('rejects NEAREST without location parameters', async () => {
      const response = await request(app.getHttpServer())
        .get('/posts')
        .query({ sort: SortOption.NEAREST, limit: 10 })
        .expect(400);

      const body = response.body as { message: string | string[] };
      expect(body.message).toEqual(
        expect.arrayContaining([expect.stringMatching(/latitude/i)]),
      );
    });

    it('rejects all-or-nothing location when only latitude is supplied', async () => {
      await request(app.getHttpServer())
        .get('/posts')
        .query({
          sort: SortOption.NEWEST,
          limit: 10,
          latitude: CENTER.latitude,
        })
        .expect(400);
    });

    it('rejects a cursor that does not match the requested sort mode', async () => {
      const mismatched = encodeCursor({
        sort: SortOption.NEWEST,
        sortValue: new Date().toISOString(),
        id: idOf('p1'),
      });

      const response = await request(app.getHttpServer())
        .get('/posts')
        .query({
          sort: SortOption.PRICE_ASC,
          limit: 10,
          cursor: mismatched,
        })
        .expect(400);

      const body = response.body as { message: string };
      expect(body.message).toBe(
        'Cursor does not match requested sorting strategy.',
      );
    });

    it('rejects an invalid cursor payload', async () => {
      const response = await request(app.getHttpServer())
        .get('/posts')
        .query({
          sort: SortOption.NEWEST,
          limit: 10,
          cursor: 'not-a-valid-cursor',
        })
        .expect(400);

      const body = response.body as { message: string };
      expect(body.message).toBe('Invalid cursor');
    });
  });
});
