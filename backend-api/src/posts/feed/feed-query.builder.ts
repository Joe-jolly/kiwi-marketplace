import { Injectable } from '@nestjs/common';
import { PostStatus, Prisma } from '@prisma/client';
import { FindPostsQueryDto } from '../dto/find-posts-query.dto';
import { CursorFields } from './cursor.util';
import { SortOption } from './sort-option.enum';

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
   * Returns `undefined` for NEAREST: distance is not a database column, so
   * it cannot be expressed as a Prisma WHERE condition. The location-aware
   * path uses `GeoFeedQueryBuilder` instead, whose raw SQL can express a
   * NEAREST cursor condition via `ST_Distance`.
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
        return undefined;
    }
  }

  /**
   * Sort-aware ORDER BY for the DB-native (no-location) path. In practice
   * this path is only ever reached for NEWEST, PRICE_ASC, or PRICE_DESC —
   * `FindPostsQueryDto` requires location parameters whenever sort=NEAREST
   * — but the switch stays exhaustive over `SortOption` for type safety;
   * the NEAREST case is unreachable dead code, not a supported query shape.
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
        return [{ createdAt: 'desc' }, { id: 'desc' }];
    }
  }

  /** DB-native path: fetch one extra row to cheaply detect `hasNextPage`. */
  buildTake(limit: number): number {
    return limit + 1;
  }
}
