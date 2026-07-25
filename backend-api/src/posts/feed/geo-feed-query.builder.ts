import { Injectable } from '@nestjs/common';
import { PostStatus, Prisma } from '@prisma/client';
import { CursorFields } from './cursor.util';
import { SortOption } from './sort-option.enum';
import { SORT_RULES } from './sort-rules';

/**
 * Input to `GeoFeedQueryBuilder.build`. Deliberately independent of
 * `FindPostsQueryDto` — this builder only needs these fields, and staying
 * decoupled keeps it independently testable ahead of Step 7, where
 * `PostsService` will supply this shape from the real request DTO.
 */
export interface GeoFeedQueryInput {
  latitude: number;
  longitude: number;
  radius: number;
  categoryId?: string;
  search?: string;
  sort: SortOption;
  limit: number;
}

/**
 * Flat shape returned by the single sanctioned raw SQL query (ADR-004:
 * Geospatial Feed Architecture). Mirrors `postFeedSelect`, minus `images`
 * (attached separately by a batched follow-up query — a JSON array or
 * lateral join here would defeat the "one predictable round trip for the
 * page + one for images" shape the spec calls for) and plus `distanceMeters`
 * (needed for NEAREST cursors; stripped from the API response later).
 */
export interface GeoFeedRow {
  id: string;
  title: string;
  price: number;
  latitude: number;
  longitude: number;
  status: PostStatus;
  createdAt: Date;
  distanceMeters: number;
  ownerId: string;
  ownerDisplayName: string;
  categoryId: string;
  categoryName: string;
}

@Injectable()
export class GeoFeedQueryBuilder {
  /**
   * Builds the single PostGIS-native query for a page of the location-aware
   * feed: status + category + search + radius filtering, cursor
   * continuation, sort-aware ordering, and a `limit + 1` fetch, all pushed
   * down into one round trip. Returns a `Prisma.Sql` fragment for
   * `prisma.$queryRaw<GeoFeedRow[]>`; never executes it itself.
   *
   * `ST_DWithin` (radius filter) and, for NEAREST, the `<->` KNN operator
   * (ordering) are both backed by the `Post_location_idx` GiST index — see
   * ADR-004 for why these are the only two spatial operators used.
   */
  build(input: GeoFeedQueryInput, cursor?: CursorFields): Prisma.Sql {
    const center = this.buildCenterPoint(input.latitude, input.longitude);

    const conditions: Prisma.Sql[] = [
      Prisma.sql`"Post"."status" = ${PostStatus.ACTIVE}::"PostStatus"`,
      Prisma.sql`ST_DWithin("Post"."location", ${center}, ${input.radius})`,
    ];

    if (input.categoryId) {
      conditions.push(Prisma.sql`"Post"."categoryId" = ${input.categoryId}`);
    }

    if (input.search) {
      const term = `%${input.search}%`;
      conditions.push(Prisma.sql`(
        "Post"."title" ILIKE ${term}
        OR "Post"."description" ILIKE ${term}
        OR "Category"."name" ILIKE ${term}
      )`);
    }

    const cursorCondition = this.buildCursorCondition(cursor, center);
    if (cursorCondition) {
      conditions.push(cursorCondition);
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
        ST_Distance("Post"."location", ${center}) AS "distanceMeters",
        "User"."id" AS "ownerId",
        "User"."displayName" AS "ownerDisplayName",
        "Category"."id" AS "categoryId",
        "Category"."name" AS "categoryName"
      FROM "Post"
      INNER JOIN "User" ON "User"."id" = "Post"."ownerId"
      INNER JOIN "Category" ON "Category"."id" = "Post"."categoryId"
      WHERE ${Prisma.join(conditions, ' AND ')}
      ORDER BY ${this.buildOrderBy(input.sort, center)}
      LIMIT ${input.limit + 1}
    `;
  }

  // X is longitude, Y is latitude, per standard GIS convention (matches the
  // generated-column expression in the Step 5 migration).
  private buildCenterPoint(latitude: number, longitude: number): Prisma.Sql {
    return Prisma.sql`ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography`;
  }

  /**
   * Sort-aware ORDER BY, driven by `SORT_RULES` so the primary field and its
   * `id` tie-break direction are declared in exactly one place. NEAREST
   * orders by the KNN distance operator against the same `center` point
   * used everywhere else in the query, rather than a plain column.
   */
  private buildOrderBy(sort: SortOption, center: Prisma.Sql): Prisma.Sql {
    const rule = SORT_RULES[sort];
    const direction = Prisma.raw(rule.direction.toUpperCase());

    if (rule.kind === 'distance') {
      return Prisma.sql`"Post"."location" <-> ${center} ${direction}, "Post"."id" ${direction}`;
    }

    const column = Prisma.raw(`"Post"."${rule.column}"`);
    return Prisma.sql`${column} ${direction}, "Post"."id" ${direction}`;
  }

  /**
   * Sort-aware cursor continuation condition, mirroring
   * `FeedQueryBuilder.buildCursorWhere`'s semantics for the three
   * DB-orderable sorts, plus NEAREST — which that Prisma-input builder
   * cannot express because distance is not a plain column, but which raw
   * SQL can via `ST_Distance` against the same `center` point.
   *
   * `rule.direction` (from `SORT_RULES`, never request-derived) picks the
   * comparison operator: ascending sorts continue with `>`, descending
   * sorts continue with `<`. The `id` tie-break always uses the same
   * operator as the primary field, per ADR-004 Business Rule 5.
   */
  private buildCursorCondition(
    cursor: CursorFields | undefined,
    center: Prisma.Sql,
  ): Prisma.Sql | undefined {
    if (!cursor) {
      return undefined;
    }

    const rule = SORT_RULES[cursor.sort];
    const op = Prisma.raw(rule.direction === 'asc' ? '>' : '<');

    if (rule.kind === 'distance') {
      const distance = Prisma.sql`ST_Distance("Post"."location", ${center})`;
      return Prisma.sql`(
        ${distance} ${op} ${cursor.sortValue}
        OR (${distance} = ${cursor.sortValue} AND "Post"."id" ${op} ${cursor.id})
      )`;
    }

    const column = Prisma.raw(`"Post"."${rule.column}"`);
    const value =
      rule.column === 'createdAt'
        ? new Date(cursor.sortValue)
        : cursor.sortValue;

    return Prisma.sql`(
      ${column} ${op} ${value}
      OR (${column} = ${value} AND "Post"."id" ${op} ${cursor.id})
    )`;
  }
}
