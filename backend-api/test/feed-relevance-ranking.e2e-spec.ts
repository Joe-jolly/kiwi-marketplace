import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma, PostStatus } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { encodeCursor } from '../src/posts/feed/cursor.util';
import { buildRelevanceScoreExpression } from '../src/posts/feed/relevance-score.sql';
import { SortOption } from '../src/posts/feed/sort-option.enum';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Search Ranking V1 — `docs/specifications/search-ranking-v1-spec.md`
 * Definition of Done checks, plus Phase 6 Track B (pg_trgm) coverage:
 *
 * 1. `sort=RELEVANCE` without `search` is rejected; with `search`, accepted.
 * 2. A full pagination walk under `sort=RELEVANCE` (with and without
 *    location) is complete, duplicate-free, and deterministically ordered
 *    by the Scoring Contract's rules — verified against an independently
 *    computed reference order (see `expectedOrder` below), not hardcoded
 *    score tiers, since `pg_trgm` similarity is a continuous value rather
 *    than the old binary weighted-`ILIKE` tiers.
 * 3. A `RELEVANCE` cursor is rejected when replayed under any other `sort`,
 *    and vice versa.
 * 4. No response payload, under any sort mode, ever contains a relevance
 *    score field.
 * 5. `search` continues to behave as filter-only, with zero order effect,
 *    under `NEWEST`, `PRICE_ASC`, `PRICE_DESC`, and `NEAREST` (regression).
 * 6. `pg_trgm` produces graded (non-binary) scores, and breaks exact ties
 *    deterministically by `id` DESC.
 *
 * Isolation notes: this suite uses a nonsense search token
 * (`SEARCH_TOKEN`) instead of a realistic word like "bike", and seeds its
 * location-bearing posts at a location far from the coordinates used by
 * `feed-v3-pagination.e2e-spec.ts` (`CENTER`, below) — both deliberately,
 * so this suite cannot cross-contaminate (or be contaminated by) any other
 * e2e suite's fixtures when Jest runs multiple `*.e2e-spec.ts` files
 * concurrently against the same real database.
 */

const E2E_DATABASE_URL =
  process.env.FEED_V3_E2E_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgresql://kiwi:kiwi_dev_password@localhost:5433/kiwi_marketplace?schema=public';

// Deliberately far from any other e2e suite's seeded coordinates (see
// isolation note above).
const CENTER = { latitude: -33.8688, longitude: 151.2093 };
const RADIUS_METERS = 2000;

// A nonsense token, guaranteed not to appear in any other suite's fixtures,
// so unscoped (no categoryId) RELEVANCE/search queries in this file can
// never accidentally match another suite's seeded posts.
const SEARCH_TOKEN = 'zylofantic';

type FeedItem = { id: string; title: string; price: number };
type FeedResponse = {
  items: FeedItem[];
  nextCursor: string | null;
  hasNextPage: boolean;
};

describe('Search Ranking V1 — RELEVANCE sort (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let categoryId: string;
  let otherCategoryId: string;
  let userId: string;
  const idsByKey = new Map<string, string>();
  const priceByKey = new Map<string, number>();

  beforeAll(async () => {
    process.env.DATABASE_URL = E2E_DATABASE_URL;
    process.env.JWT_SECRET =
      process.env.JWT_SECRET ?? 'feed-relevance-e2e-test-secret';

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
    await seed();
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  async function seed() {
    await cleanup();

    const category = await prisma.category.create({
      data: { name: '__feed_relevance_e2e_cat__', schema: {} },
    });
    categoryId = category.id;

    const otherCategory = await prisma.category.create({
      data: { name: '__feed_relevance_e2e_other_cat__', schema: {} },
    });
    otherCategoryId = otherCategory.id;

    const user = await prisma.user.create({
      data: {
        phone: '__feed_relevance_e2e_phone__',
        passwordHash: 'x',
        displayName: 'Feed Relevance E2E Seller',
      },
    });
    userId = user.id;

    // All rows below match `SEARCH_TOKEN` somewhere (title, description, or
    // category name), are ACTIVE, and are within RADIUS_METERS of CENTER.
    // Under the finalized pg_trgm scoring (Phase 6, Track B), the exact
    // relevance order among them is a continuous function of trigram
    // similarity, not a fixed set of discrete tiers — so tests below
    // compute the expected order independently (`expectedOrder`) rather
    // than hardcoding score values. Fixture *intent* is documented per key.
    const seedPosts = [
      {
        key: 'title-match-1',
        title: `Mountain ${SEARCH_TOKEN} for sale`,
        description: 'A sturdy ride',
        price: 100,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        key: 'title-match-2',
        title: `Road ${SEARCH_TOKEN}, lightweight`,
        description: 'Great for commuting',
        price: 200,
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
      },
      {
        key: 'description-match',
        title: 'Two-wheeled vehicle',
        description: `This is a used ${SEARCH_TOKEN} in good condition`,
        price: 150,
        createdAt: new Date('2026-01-03T00:00:00.000Z'),
      },
      {
        key: 'category-only-match',
        title: 'Wooden desk',
        description: 'Solid oak, no scratches',
        price: 80,
        createdAt: new Date('2026-01-04T00:00:00.000Z'),
        useOtherMatchingCategory: true,
      },
      {
        key: 'no-match',
        title: 'Kitchen blender',
        description: 'Barely used, works great',
        price: 30,
        createdAt: new Date('2026-01-05T00:00:00.000Z'),
      },
      {
        key: 'deleted-title-match',
        title: `Deleted ${SEARCH_TOKEN} listing`,
        description: 'Should never appear',
        price: 999,
        createdAt: new Date('2026-01-06T00:00:00.000Z'),
        status: PostStatus.DELETED,
      },
      // Exact-vs-diluted match: under the old binary weighted-ILIKE scoring
      // these would have tied (both a "title match"). Under pg_trgm, a
      // title that *is* the search term should score far higher than a
      // long title that only mentions it in passing — this pair is the
      // regression guard against ever reverting to a binary scorer.
      {
        key: 'exact-title-match',
        title: SEARCH_TOKEN,
        description: 'Great item, exact title match',
        price: 60,
        createdAt: new Date('2026-01-08T00:00:00.000Z'),
      },
      {
        key: 'verbose-title-match',
        title: `A very long descriptive listing title that happens to mention ${SEARCH_TOKEN} somewhere near the end of a long sentence`,
        description: 'Great item, diluted title match',
        price: 65,
        createdAt: new Date('2026-01-09T00:00:00.000Z'),
      },
      // Genuine tie pair: identical title, identical description, same
      // category — so all three weighted `similarity()` components are
      // bit-identical and the total score ties exactly, exercising the
      // `id` DESC tie-break deterministically (not just theoretically).
      {
        key: 'tie-a',
        title: `Duplicate ${SEARCH_TOKEN} listing text`,
        description: 'Identical description for tie test',
        price: 111,
        createdAt: new Date('2026-01-10T00:00:00.000Z'),
      },
      {
        key: 'tie-b',
        title: `Duplicate ${SEARCH_TOKEN} listing text`,
        description: 'Identical description for tie test',
        price: 222,
        createdAt: new Date('2026-01-11T00:00:00.000Z'),
      },
    ];

    // A category whose *name* itself contains the search token, so
    // `category-only-match` (whose title/description do not mention it)
    // only matches via the category-name predicate.
    const tokenNamedCategory = await prisma.category.create({
      data: {
        name: `__feed_relevance_e2e_${SEARCH_TOKEN}_category__`,
        schema: {},
      },
    });

    for (const post of seedPosts) {
      const created = await prisma.post.create({
        data: {
          ownerId: userId,
          categoryId: post.useOtherMatchingCategory
            ? tokenNamedCategory.id
            : categoryId,
          title: post.title,
          price: post.price,
          description: post.description,
          details: {},
          latitude: CENTER.latitude,
          longitude: CENTER.longitude,
          status: post.status ?? PostStatus.ACTIVE,
          createdAt: post.createdAt,
        },
      });
      idsByKey.set(post.key, created.id);
      priceByKey.set(post.key, post.price);
    }

    // A title-only match in a visibly different category — used by the
    // categoryId-filter case to prove RELEVANCE composes with category
    // filtering.
    const otherCategoryTitleMatch = await prisma.post.create({
      data: {
        ownerId: userId,
        categoryId: otherCategoryId,
        title: `Another ${SEARCH_TOKEN} in a different category`,
        price: 120,
        description: 'Great condition, ready to go',
        details: {},
        latitude: CENTER.latitude,
        longitude: CENTER.longitude,
        status: PostStatus.ACTIVE,
        createdAt: new Date('2026-01-07T00:00:00.000Z'),
      },
    });
    idsByKey.set('title-match-other-category', otherCategoryTitleMatch.id);
    priceByKey.set('title-match-other-category', 120);
  }

  async function cleanup() {
    if (!prisma) {
      return;
    }

    await prisma.postImage.deleteMany({
      where: {
        post: {
          OR: [
            { category: { name: { startsWith: '__feed_relevance_e2e_' } } },
            { owner: { phone: '__feed_relevance_e2e_phone__' } },
          ],
        },
      },
    });
    await prisma.post.deleteMany({
      where: {
        OR: [
          { category: { name: { startsWith: '__feed_relevance_e2e_' } } },
          { owner: { phone: '__feed_relevance_e2e_phone__' } },
        ],
      },
    });
    await prisma.category.deleteMany({
      where: { name: { startsWith: '__feed_relevance_e2e_' } },
    });
    await prisma.user.deleteMany({
      where: { phone: '__feed_relevance_e2e_phone__' },
    });
  }

  function idOf(key: string): string {
    const id = idsByKey.get(key);
    if (!id) {
      throw new Error(`Unknown seed key: ${key}`);
    }
    return id;
  }

  /**
   * Independent reference oracle for the expected `RELEVANCE` order among
   * this suite's own fixtures. Reuses the shared, production
   * `buildRelevanceScoreExpression` (so the test's notion of "score" can
   * never drift from what `PostsService` actually computes) but performs
   * its own query, filter, and sort — it does not call into
   * `FeedQueryBuilder`/`GeoFeedQueryBuilder`/`PostsService` at all — so
   * this remains a true end-to-end check of the API's pagination and
   * ordering logic, not a tautology.
   *
   * Scoped to this suite's own `ownerId` so it can never accidentally
   * include another suite's fixtures, and optionally further scoped to a
   * `categoryId`, mirroring the API's own filter precedence.
   */
  async function expectedOrder(options?: {
    categoryId?: string;
  }): Promise<string[]> {
    const relevanceScore = buildRelevanceScoreExpression(SEARCH_TOKEN);
    const term = `%${SEARCH_TOKEN}%`;
    const conditions: Prisma.Sql[] = [
      Prisma.sql`"Post"."status" = 'ACTIVE'::"PostStatus"`,
      Prisma.sql`"Post"."ownerId" = ${userId}`,
      Prisma.sql`(
        "Post"."title" ILIKE ${term}
        OR "Post"."description" ILIKE ${term}
        OR "Category"."name" ILIKE ${term}
      )`,
    ];
    if (options?.categoryId) {
      conditions.push(Prisma.sql`"Post"."categoryId" = ${options.categoryId}`);
    }

    const rows = await prisma.$queryRaw<{ id: string; score: number }[]>(
      Prisma.sql`
        SELECT "Post"."id" AS id, ${relevanceScore} AS score
        FROM "Post"
        INNER JOIN "Category" ON "Category"."id" = "Post"."categoryId"
        WHERE ${Prisma.join(conditions, ' AND ')}
      `,
    );

    return rows
      .sort((a, b) => b.score - a.score || (a.id < b.id ? 1 : -1))
      .map((r) => r.id);
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

  // -------------------------------------------------------------------------
  // 1. Validation
  // -------------------------------------------------------------------------

  describe('validation', () => {
    it('rejects sort=RELEVANCE without a search term', async () => {
      const response = await request(app.getHttpServer())
        .get('/posts')
        .query({ sort: SortOption.RELEVANCE, limit: 10 })
        .expect(400);

      const body = response.body as { message: string | string[] };
      expect(body.message).toEqual(
        expect.arrayContaining([expect.stringMatching(/search/i)]),
      );
    });

    it('rejects sort=RELEVANCE with an empty (whitespace-only) search term', async () => {
      await request(app.getHttpServer())
        .get('/posts')
        .query({ sort: SortOption.RELEVANCE, search: '   ', limit: 10 })
        .expect(400);
    });

    it('accepts sort=RELEVANCE with a non-empty search term', async () => {
      await request(app.getHttpServer())
        .get('/posts')
        .query({ sort: SortOption.RELEVANCE, search: SEARCH_TOKEN, limit: 10 })
        .expect(200);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Pagination — no-location path
  // -------------------------------------------------------------------------

  describe('pagination — no-location path', () => {
    it('full walk is complete, duplicate-free, and matches the independently computed score order', async () => {
      const expected = await expectedOrder();
      const { ids, pages } = await walkFeed({
        sort: SortOption.RELEVANCE,
        search: SEARCH_TOKEN,
        limit: 2,
      });

      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).not.toContain(idOf('no-match'));
      expect(ids).not.toContain(idOf('deleted-title-match'));
      expect(pages.length).toBeGreaterThan(1);

      // Verify the exact deterministic order, not just membership.
      expect(ids).toEqual(expected);
    });

    it('composes with categoryId as an additional filter', async () => {
      const expected = await expectedOrder({ categoryId });
      const { ids } = await walkFeed({
        sort: SortOption.RELEVANCE,
        search: SEARCH_TOKEN,
        categoryId,
        limit: 10,
      });

      expect(ids).toEqual(expected);
      // Sanity check: `category-only-match` lives in a different category
      // and must be excluded when filtering by `categoryId`.
      expect(ids).not.toContain(idOf('category-only-match'));
    });
  });

  // -------------------------------------------------------------------------
  // 2b. Pagination — location-present path
  // -------------------------------------------------------------------------

  describe('pagination — location-present path', () => {
    it('full walk with location composes the radius filter with RELEVANCE ordering', async () => {
      const expected = await expectedOrder();
      const { ids, pages } = await walkFeed({
        sort: SortOption.RELEVANCE,
        search: SEARCH_TOKEN,
        latitude: CENTER.latitude,
        longitude: CENTER.longitude,
        radius: RADIUS_METERS,
        limit: 2,
      });

      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toEqual(expected);
      expect(pages.length).toBeGreaterThan(1);

      for (const page of pages) {
        for (const item of page.items) {
          expect(item).not.toHaveProperty('distance');
        }
      }
    });

    it('excludes posts outside the requested radius even if they match', async () => {
      const response = await request(app.getHttpServer())
        .get('/posts')
        .query({
          sort: SortOption.RELEVANCE,
          search: SEARCH_TOKEN,
          latitude: CENTER.latitude + 10,
          longitude: CENTER.longitude,
          radius: 100,
          limit: 10,
        })
        .expect(200);

      const body = response.body as FeedResponse;
      expect(body.items).toEqual([]);
      expect(body.hasNextPage).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 2c. Pagination stability
  // -------------------------------------------------------------------------

  describe('pagination stability', () => {
    it('returns identical ordering across repeated walks and across different page sizes', async () => {
      const walkA = await walkFeed({
        sort: SortOption.RELEVANCE,
        search: SEARCH_TOKEN,
        limit: 2,
      });
      const walkB = await walkFeed({
        sort: SortOption.RELEVANCE,
        search: SEARCH_TOKEN,
        limit: 3,
      });
      const walkC = await walkFeed({
        sort: SortOption.RELEVANCE,
        search: SEARCH_TOKEN,
        limit: 50,
      });

      expect(walkB.ids).toEqual(walkA.ids);
      expect(walkC.ids).toEqual(walkA.ids);
      // A single page is enough to hold every fixture at limit=50.
      expect(walkC.pages.length).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Cursor cross-sort rejection
  // -------------------------------------------------------------------------

  describe('cursor cross-sort rejection', () => {
    it('rejects a RELEVANCE cursor replayed against a different requested sort', async () => {
      const relevanceCursor = encodeCursor({
        sort: SortOption.RELEVANCE,
        sortValue: 3,
        id: idOf('title-match-1'),
      });

      const response = await request(app.getHttpServer())
        .get('/posts')
        .query({
          sort: SortOption.NEWEST,
          limit: 10,
          cursor: relevanceCursor,
        })
        .expect(400);

      const body = response.body as { message: string };
      expect(body.message).toBe(
        'Cursor does not match requested sorting strategy.',
      );
    });

    it('rejects a non-RELEVANCE cursor replayed against sort=RELEVANCE', async () => {
      const newestCursor = encodeCursor({
        sort: SortOption.NEWEST,
        sortValue: new Date().toISOString(),
        id: idOf('title-match-1'),
      });

      const response = await request(app.getHttpServer())
        .get('/posts')
        .query({
          sort: SortOption.RELEVANCE,
          search: SEARCH_TOKEN,
          limit: 10,
          cursor: newestCursor,
        })
        .expect(400);

      const body = response.body as { message: string };
      expect(body.message).toBe(
        'Cursor does not match requested sorting strategy.',
      );
    });

    it('accepts a real RELEVANCE cursor and continues the walk correctly', async () => {
      const full = await walkFeed({
        sort: SortOption.RELEVANCE,
        search: SEARCH_TOKEN,
        limit: 50,
      });
      expect(full.pages.length).toBe(1);

      const firstPage = await request(app.getHttpServer())
        .get('/posts')
        .query({ sort: SortOption.RELEVANCE, search: SEARCH_TOKEN, limit: 3 })
        .expect(200);
      const firstBody = firstPage.body as FeedResponse;
      expect(firstBody.hasNextPage).toBe(true);

      const secondPage = await request(app.getHttpServer())
        .get('/posts')
        .query({
          sort: SortOption.RELEVANCE,
          search: SEARCH_TOKEN,
          limit: 3,
          cursor: firstBody.nextCursor!,
        })
        .expect(200);
      const secondBody = secondPage.body as FeedResponse;

      const combined = [...firstBody.items, ...secondBody.items].map(
        (i) => i.id,
      );
      expect(combined).toEqual(full.ids.slice(0, combined.length));
    });
  });

  // -------------------------------------------------------------------------
  // 4. Response contract — relevance score never exposed
  // -------------------------------------------------------------------------

  describe('response contract', () => {
    it('never includes a relevance score field, under RELEVANCE or any other sort', async () => {
      const relevanceResponse = await request(app.getHttpServer())
        .get('/posts')
        .query({ sort: SortOption.RELEVANCE, search: SEARCH_TOKEN, limit: 10 })
        .expect(200);

      const relevanceBody = relevanceResponse.body as FeedResponse;
      expect(relevanceBody.items.length).toBeGreaterThan(0);
      for (const item of relevanceBody.items) {
        expect(item).not.toHaveProperty('relevance');
        expect(item).not.toHaveProperty('relevanceScore');
        expect(item).not.toHaveProperty('score');
        expect(item).not.toHaveProperty('distance');
      }

      const newestResponse = await request(app.getHttpServer())
        .get('/posts')
        .query({ sort: SortOption.NEWEST, search: SEARCH_TOKEN, limit: 10 })
        .expect(200);

      const newestBody = newestResponse.body as FeedResponse;
      for (const item of newestBody.items) {
        expect(item).not.toHaveProperty('relevance');
        expect(item).not.toHaveProperty('relevanceScore');
      }
    });
  });

  // -------------------------------------------------------------------------
  // 5. pg_trgm scoring behavior (Phase 6, Track B)
  // -------------------------------------------------------------------------

  describe('pg_trgm scoring behavior', () => {
    it('produces graded (non-binary) scores: an exact title match outranks a diluted title match', async () => {
      const { ids } = await walkFeed({
        sort: SortOption.RELEVANCE,
        search: SEARCH_TOKEN,
        limit: 50,
      });

      const exactIndex = ids.indexOf(idOf('exact-title-match'));
      const verboseIndex = ids.indexOf(idOf('verbose-title-match'));
      expect(exactIndex).toBeGreaterThanOrEqual(0);
      expect(verboseIndex).toBeGreaterThanOrEqual(0);
      expect(exactIndex).toBeLessThan(verboseIndex);
    });

    it('breaks an exact score tie deterministically by id DESC', async () => {
      const tieA = idOf('tie-a');
      const tieB = idOf('tie-b');

      // Independently confirm these two rows really do score identically
      // under the finalized formula before asserting on their relative
      // order — otherwise this test would be checking the wrong thing.
      const relevanceScore = buildRelevanceScoreExpression(SEARCH_TOKEN);
      const rows = await prisma.$queryRaw<{ id: string; score: number }[]>(
        Prisma.sql`
          SELECT "Post"."id" AS id, ${relevanceScore} AS score
          FROM "Post"
          INNER JOIN "Category" ON "Category"."id" = "Post"."categoryId"
          WHERE "Post"."id" IN (${tieA}, ${tieB})
        `,
      );
      expect(rows).toHaveLength(2);
      expect(rows[0].score).toBeCloseTo(rows[1].score, 10);

      const { ids } = await walkFeed({
        sort: SortOption.RELEVANCE,
        search: SEARCH_TOKEN,
        limit: 50,
      });

      const [expectedFirst, expectedSecond] =
        tieA > tieB ? [tieA, tieB] : [tieB, tieA];
      expect(ids.indexOf(expectedFirst)).toBeLessThan(
        ids.indexOf(expectedSecond),
      );
    });
  });

  // -------------------------------------------------------------------------
  // 6. Regression — search remains filter-only for every other sort mode
  // -------------------------------------------------------------------------

  describe('regression — search is filter-only outside RELEVANCE', () => {
    it.each([SortOption.NEWEST, SortOption.PRICE_ASC, SortOption.PRICE_DESC])(
      'sort=%s with search narrows results but orders strictly by the sort field, not by match quality',
      async (sort) => {
        const { ids } = await walkFeed({
          sort,
          search: SEARCH_TOKEN,
          limit: 10,
        });

        const expectedMembers = [...idsByKey.keys()]
          .filter((key) => key !== 'no-match' && key !== 'deleted-title-match')
          .map((key) => idOf(key));
        expect([...ids].sort()).toEqual([...expectedMembers].sort());

        // Order must follow the sort field, not the RELEVANCE score — i.e.
        // a strong relevance match may legitimately rank anywhere under
        // PRICE_ASC/PRICE_DESC/NEWEST, proving search did not influence
        // ordering for these sort modes.
        if (sort === SortOption.PRICE_ASC || sort === SortOption.PRICE_DESC) {
          const priceOf = (id: string) => {
            const key = [...idsByKey.entries()].find(
              ([, value]) => value === id,
            )?.[0];
            return key ? (priceByKey.get(key) ?? 0) : 0;
          };
          const sortedByPrice = [...expectedMembers].sort((a, b) =>
            sort === SortOption.PRICE_ASC
              ? priceOf(a) - priceOf(b)
              : priceOf(b) - priceOf(a),
          );
          expect(ids).toEqual(sortedByPrice);
        }
      },
    );

    it('sort=NEAREST with search still requires location and orders by distance, not relevance', async () => {
      const { ids } = await walkFeed({
        sort: SortOption.NEAREST,
        search: SEARCH_TOKEN,
        latitude: CENTER.latitude,
        longitude: CENTER.longitude,
        radius: RADIUS_METERS,
        limit: 10,
      });

      const expectedMembers = [...idsByKey.keys()]
        .filter((key) => key !== 'no-match' && key !== 'deleted-title-match')
        .map((key) => idOf(key));
      expect([...ids].sort()).toEqual([...expectedMembers].sort());
    });
  });
});
