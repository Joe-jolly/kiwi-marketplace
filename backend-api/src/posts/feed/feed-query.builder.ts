import { PostStatus, Prisma } from '@prisma/client';
import { FindPostsQueryDto } from '../dto/find-posts-query.dto';
import { FeedCursor } from './cursor.util';

export class FeedQueryBuilder {
  buildWhere(
    query: FindPostsQueryDto,
    cursor?: FeedCursor,
  ): Prisma.PostWhereInput {
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

    const cursorCondition = this.buildCursorWhere(cursor);

    if (cursorCondition) {
      where.AND = [
        ...(where.AND ? this.toArray(where.AND) : []),
        cursorCondition,
      ];
    }

    return where;
  }

  buildTake(limit: number): number {
    return limit + 1;
  }

  buildCursorWhere(cursor?: FeedCursor): Prisma.PostWhereInput | undefined {
    if (!cursor) {
      return undefined;
    }

    return this.buildCursorCondition(cursor);
  }

  buildOrderBy(): Prisma.PostOrderByWithRelationInput[] {
    return [{ createdAt: 'desc' }, { id: 'desc' }];
  }

  private buildCursorCondition(cursor: FeedCursor): Prisma.PostWhereInput {
    const createdAt = new Date(cursor.createdAt);

    return {
      OR: [
        {
          createdAt: {
            lt: createdAt,
          },
        },
        {
          createdAt,
          id: {
            lt: cursor.id,
          },
        },
      ],
    };
  }

  private toArray<T>(value: T | T[]): T[] {
    return Array.isArray(value) ? value : [value];
  }
}
