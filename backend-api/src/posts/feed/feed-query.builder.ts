import { Injectable } from '@nestjs/common';
import { PostStatus, Prisma } from '@prisma/client';
import { FindPostsQueryDto } from '../dto/find-posts-query.dto';
import { CursorFields } from './cursor.util';
import { buildRelevanceScoreExpression } from './relevance-score.sql';
import { SortOption } from './sort-option.enum';
import { SORT_RULES } from './sort-rules';

@Injectable()
export class FeedQueryBuilder {
  /**
   * Search + category filter for the DB-native (no-location) path.
   * Does not include cursor conditions; see `buildCursorWhere`.
   */
  buildWhere(query: FindPostsQueryDto): Prisma.PostWhereInput {
    const where: Prisma.PostWhereInput = {
      status: PostStatus.ACTIVE,
    };

    if (query.categoryId) {
      where.categoryId = query.categoryId;
    }

    if (query.search) {
      where.OR = [
        {
          title: {
            contains: query.search,
            mode: Prisma.QueryMode.insensitive,
          },
        },
        {
          description: {
            contains: query.search,
            mode: Prisma.QueryMode.insensitive,
          },
        },
        {
          category: {
            name: {
              contains: query.search,
              mode: Prisma.QueryMode.insensitive,
            },
          },
        },
      ];
    }

    return where;
  }

  /**
   * Sort-aware cursor condition for the DB-native (no-location) path.
   * Derives the sorting mode from `cursor.sort` so callers never need to
   * pass `sort` separately. Accepts the bare `CursorFields` shape (no `v`)
   * rather than a full `FeedCursor`, since it never needs to be re-encoded.
   *
   * Returns `undefined` for NEAREST and RELEVANCE: neither distance nor the
   * relevance score is a plain database column, so neither can be expressed
   * as a Prisma WHERE condition. NEAREST always routes through
   * `GeoFeedQueryBuilder`; RELEVANCE without location routes through this
   * class's own `buildRelevanceQuery` raw-SQL method instead — both express
   * their cursor condition directly in SQL.
   */
  buildCursorWhere(cursor?: CursorFields): Prisma.PostWhereInput | undefined {
    if (!cursor) {
      return undefined;
    }

    switch (cursor.sort) {
      case SortOption.NEWEST: {
        const createdAt = new Date(cursor.sortValue);
        return {
          OR: [
            { createdAt: { lt: createdAt } },
            { createdAt, id: { lt: cursor.id } },
          ],
        };
      }
      case SortOption.PRICE_ASC:
        return {
          OR: [
            { price: { gt: cursor.sortValue } },
            { price: cursor.sortValue, id: { gt: cursor.id } },
          ],
        };
      case SortOption.PRICE_DESC:
        return {
          OR: [
            { price: { lt: cursor.sortValue } },
            { price: cursor.sortValue, id: { lt: cursor.id } },
          ],
        };
      case SortOption.NEAREST:
      case SortOption.RELEVANCE:
        return undefined;
    }
  }

  /**
   * Sort-aware ORDER BY for the DB-native (no-location) path. In practice
   * this path is only ever reached for NEWEST, PRICE_ASC, or PRICE_DESC —
   * `FindPostsQueryDto` requires location parameters whenever sort=NEAREST,
   * and RELEVANCE without location routes through `buildRelevanceQuery`
   * instead — but the switch stays exhaustive over `SortOption` for type
   * safety; the NEAREST/RELEVANCE cases are unreachable dead code, not a
   * supported query shape for this method.
   */
  buildOrderBy(sort: SortOption): Prisma.PostOrderByWithRelationInput[] {
    switch (sort) {
      case SortOption.NEWEST:
        return [{ createdAt: 'desc' }, { id: 'desc' }];
      case SortOption.PRICE_ASC:
        return [{ price: 'asc' }, { id: 'asc' }];
      case SortOption.PRICE_DESC:
        return [{ price: 'desc' }, { id: 'desc' }];
      case SortOption.NEAREST:
      case SortOption.RELEVANCE:
        return [{ createdAt: 'desc' }, { id: 'desc' }];
    }
  }

  /** DB-native path: fetch one extra row to cheaply detect `hasNextPage`. */
  buildTake(limit: number): number {
    return limit + 1;
  }

  /**
   * RELEVANCE, no-location path: `search` is required and non-empty
   * whenever `sort=RELEVANCE` (enforced by `FindPostsQueryDto`), and Prisma
   * has no way to express an arbitrary computed score as an orderable,
   * cursor-comparable expression. Mirroring the one exception ADR-004 makes
   * for the `location` column, this is a scoped raw SQL query — composing
   * status, optional category, the search filter, and the shared relevance
   * score (`relevance-score.sql.ts`, also used by `GeoFeedQueryBuilder` for
   * the location-present RELEVANCE case) into one round trip.
   *
   * Returns rows shaped identically to `GeoFeedQueryBuilder`'s `GeoFeedRow`
   * (`distanceMeters` is always `NULL` here, since no location was
   * supplied), so `PostsService` can reuse the same image-hydration and
   * response-shaping logic for both raw-SQL query results.
   */
  buildRelevanceQuery(
    input: { search: string; categoryId?: string; limit: number },
    cursor?: CursorFields,
  ): Prisma.Sql {
    const relevanceScore = buildRelevanceScoreExpression(input.search);
    const rule = SORT_RULES[SortOption.RELEVANCE];
    const direction = Prisma.raw(rule.direction.toUpperCase());

    const term = `%${input.search}%`;
    const conditions: Prisma.Sql[] = [
      Prisma.sql`"Post"."status" = ${PostStatus.ACTIVE}::"PostStatus"`,
      Prisma.sql`(
        "Post"."title" ILIKE ${term}
        OR "Post"."description" ILIKE ${term}
        OR "Category"."name" ILIKE ${term}
      )`,
    ];

    if (input.categoryId) {
      conditions.push(Prisma.sql`"Post"."categoryId" = ${input.categoryId}`);
    }

    if (cursor) {
      const op = Prisma.raw(rule.direction === 'asc' ? '>' : '<');
      conditions.push(Prisma.sql`(
        ${relevanceScore} ${op} ${cursor.sortValue}
        OR (${relevanceScore} = ${cursor.sortValue} AND "Post"."id" ${op} ${cursor.id})
      )`);
    }

    return Prisma.sql`
      SELECT
        "Post"."id" AS "id",
        "Post"."title" AS "title",
        "Post"."price" AS "price",
        "Post"."latitude" AS "latitude",
        "Post"."longitude" AS "longitude",
        "Post"."status" AS "status",
        "Post"."createdAt" AS "createdAt",
        NULL::double precision AS "distanceMeters",
        ${relevanceScore} AS "relevanceScore",
        "User"."id" AS "ownerId",
        "User"."displayName" AS "ownerDisplayName",
        "Category"."id" AS "categoryId",
        "Category"."name" AS "categoryName"
      FROM "Post"
      INNER JOIN "User" ON "User"."id" = "Post"."ownerId"
      INNER JOIN "Category" ON "Category"."id" = "Post"."categoryId"
      WHERE ${Prisma.join(conditions, ' AND ')}
      ORDER BY ${relevanceScore} ${direction}, "Post"."id" ${direction}
      LIMIT ${input.limit + 1}
    `;
  }
}
