import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PostStatus, UserRole, type Prisma, type User } from '@prisma/client';
import { CursorPaginationQueryDto } from '../common/dto/cursor-pagination-query.dto';
import {
  decodeKeysetCursor,
  encodeKeysetCursor,
} from '../common/pagination/keyset-cursor.util';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreatePostDto } from './dto/create-post.dto';
import { FindPostsQueryDto } from './dto/find-posts-query.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import {
  CursorFields,
  decodeCursor,
  encodeCursor,
  FeedCursor,
} from './feed/cursor.util';
import { FeedQueryBuilder } from './feed/feed-query.builder';
import { GeoFeedQueryBuilder, GeoFeedRow } from './feed/geo-feed-query.builder';
import { SortOption } from './feed/sort-option.enum';
import { isPostHiddenFromPublic } from './post-visibility.util';
import { postDetailSelect, postFeedSelect } from './post.select';
import { resolveImageUrls } from './resolve-image-urls.util';

/** Scopes `GET /posts/me`'s cursor so it can't be replayed against another
 * single-sort-mode cursor endpoint (currently `GET /favorites`). */
const MINE_CURSOR_PURPOSE = 'posts-mine';

/** Owner restore window for soft-deleted posts (product rule). */
const RESTORE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

type MutablePostState = {
  id: string;
  ownerId: string;
  status: PostStatus;
};

type FeedRow = Prisma.PostGetPayload<{ select: typeof postFeedSelect }>;
// `distance` and `relevance` are attached only by the raw-SQL paths (from
// `GeoFeedRow.distanceMeters` / `GeoFeedRow.relevanceScore`), used
// internally to build the next cursor, and stripped before the response is
// returned (the spec forbids exposing either in the API response).
type FeedItem = FeedRow & { distance?: number; relevance?: number };

type LocationQuery = FindPostsQueryDto & {
  latitude: number;
  longitude: number;
  radius: number;
};

@Injectable()
export class PostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly feedQueryBuilder: FeedQueryBuilder,
    private readonly geoFeedQueryBuilder: GeoFeedQueryBuilder,
    private readonly storageService: StorageService,
  ) {}

  async findAll(query: FindPostsQueryDto) {
    const cursor = decodeCursor(query.cursor, query.sort);

    if (this.hasLocationParams(query)) {
      // Location present: RELEVANCE composes with the radius predicate
      // exactly like every other sort mode, so it stays on this path too.
      return this.findAllWithDistanceFilter(query, cursor);
    }

    if (query.sort === SortOption.RELEVANCE) {
      // `FindPostsQueryDto` guarantees `search` is a non-empty string
      // whenever `sort=RELEVANCE`.
      return this.findAllByRelevance(
        query as FindPostsQueryDto & { search: string },
        cursor,
      );
    }

    return this.findAllDbNative(query, cursor);
  }

  /**
   * Owner's posts: every non-DELETED status, plus DELETED posts still inside
   * the 30-day restore window. Older soft-deleted posts are hidden from the
   * owner UI but remain in the database.
   *
   * Cursor-paginated (`createdAt desc, id desc`), like every other list
   * endpoint — API Constitution §9 ("large lists must never return all
   * records") applies here exactly as it does to the feed; this was
   * previously an unpaginated array, corrected as part of the Phase 8/9
   * hardening pass.
   */
  async findMine(user: User, query: CursorPaginationQueryDto) {
    const restoreWindowStart = new Date(Date.now() - RESTORE_WINDOW_MS);
    const cursor = decodeKeysetCursor(MINE_CURSOR_PURPOSE, query.cursor);

    const baseWhere: Prisma.PostWhereInput = {
      ownerId: user.id,
      OR: [
        { status: { not: PostStatus.DELETED } },
        {
          status: PostStatus.DELETED,
          deletedAt: { gte: restoreWindowStart },
        },
      ],
    };

    const cursorWhere: Prisma.PostWhereInput | undefined = cursor
      ? {
          OR: [
            { createdAt: { lt: cursor.sortValue } },
            { createdAt: cursor.sortValue, id: { lt: cursor.id } },
          ],
        }
      : undefined;

    const rows = await this.prisma.post.findMany({
      where: cursorWhere ? { AND: [baseWhere, cursorWhere] } : baseWhere,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      select: postDetailSelect,
    });

    const hasNextPage = rows.length > query.limit;
    const pageRows = hasNextPage ? rows.slice(0, query.limit) : rows;
    const items = pageRows.map((post) =>
      resolveImageUrls(this.storageService, post),
    );

    const lastItem = items.at(-1);
    const nextCursor =
      hasNextPage && lastItem
        ? encodeKeysetCursor(
            MINE_CURSOR_PURPOSE,
            lastItem.createdAt,
            lastItem.id,
          )
        : null;

    return { items, nextCursor, hasNextPage };
  }

  /**
   * DB-native path: no location parameters, so search + category + cursor
   * pagination can all be pushed down into a single Prisma query, exactly
   * like the pre-Feed-V2 implementation (now sort-aware).
   */
  private async findAllDbNative(query: FindPostsQueryDto, cursor?: FeedCursor) {
    const baseWhere = this.feedQueryBuilder.buildWhere(query);
    const cursorWhere = this.feedQueryBuilder.buildCursorWhere(cursor);

    const rows = await this.prisma.post.findMany({
      where: cursorWhere ? { AND: [baseWhere, cursorWhere] } : baseWhere,
      orderBy: this.feedQueryBuilder.buildOrderBy(query.sort),
      take: this.feedQueryBuilder.buildTake(query.limit),
      select: postFeedSelect,
    });

    const hasNextPage = rows.length > query.limit;
    const pageRows = hasNextPage ? rows.slice(0, query.limit) : rows;
    const items = pageRows.map((row) =>
      resolveImageUrls(this.storageService, row),
    );

    return this.buildResponse(items, query.sort, hasNextPage);
  }

  /**
   * PostGIS-native path: location parameters are present (required whenever
   * sort=NEAREST, optional otherwise per the Compatibility Rules). Filtering,
   * radius containment, sort-aware ordering, and cursor continuation are all
   * pushed down into the single raw SQL query built by `GeoFeedQueryBuilder`
   * (ADR-004: Geospatial Feed Architecture) — one database round trip for
   * the page, exactly like the no-location path.
   */
  private async findAllWithDistanceFilter(
    query: LocationQuery,
    cursor?: FeedCursor,
  ) {
    const sql = this.geoFeedQueryBuilder.build(query, cursor);
    const rows = await this.prisma.$queryRaw<GeoFeedRow[]>(sql);

    const hasNextPage = rows.length > query.limit;
    const pageRows = hasNextPage ? rows.slice(0, query.limit) : rows;
    const items = await this.hydrateImages(pageRows);

    return this.buildResponse(items, query.sort, hasNextPage);
  }

  /**
   * RELEVANCE, no-location path: search is required and non-empty (DTO
   * validation), and — like the location-present path — the relevance score
   * cannot be expressed as a Prisma ORDER BY/cursor condition, so this uses
   * `FeedQueryBuilder.buildRelevanceQuery`'s scoped raw SQL query instead of
   * `findAllDbNative`. Result rows share `GeoFeedRow`'s shape, so image
   * hydration and response building are reused unchanged.
   */
  private async findAllByRelevance(
    query: FindPostsQueryDto & { search: string },
    cursor?: FeedCursor,
  ) {
    const sql = this.feedQueryBuilder.buildRelevanceQuery(
      {
        search: query.search,
        categoryId: query.categoryId,
        limit: query.limit,
      },
      cursor,
    );
    const rows = await this.prisma.$queryRaw<GeoFeedRow[]>(sql);

    const hasNextPage = rows.length > query.limit;
    const pageRows = hasNextPage ? rows.slice(0, query.limit) : rows;
    const items = await this.hydrateImages(pageRows);

    return this.buildResponse(items, query.sort, hasNextPage);
  }

  /**
   * Reshapes the flat `GeoFeedRow`s from the raw SQL query into the same
   * `FeedItem` shape (`postFeedSelect` + `distance`) the no-location Prisma
   * path produces, and attaches `images` via one additional query keyed by
   * the page's post ids — see ADR-004 / the V3 implementation plan's "One
   * Query Per Page" clarification: this batched lookup, not the page query
   * itself, is how the one-to-many `images` collection is populated.
   */
  private async hydrateImages(rows: GeoFeedRow[]): Promise<FeedItem[]> {
    if (rows.length === 0) {
      return [];
    }

    const images = await this.prisma.postImage.findMany({
      where: { postId: { in: rows.map((row) => row.id) } },
      orderBy: { displayOrder: 'asc' },
      select: { postId: true, imageUrl: true, displayOrder: true },
    });

    const imagesByPostId = new Map<
      string,
      { imageUrl: string; displayOrder: number }[]
    >();
    for (const image of images) {
      const postImages = imagesByPostId.get(image.postId) ?? [];
      postImages.push({
        // `image.imageUrl` holds the stored R2 object key (column name and
        // type are unchanged — ADR-005); resolve it to a public URL here so
        // this raw-SQL path returns the same directly-usable `imageUrl` the
        // Prisma-native paths produce via `resolveImageUrls`.
        imageUrl: this.storageService.getPublicUrl(image.imageUrl),
        displayOrder: image.displayOrder,
      });
      imagesByPostId.set(image.postId, postImages);
    }

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      price: row.price,
      latitude: row.latitude,
      longitude: row.longitude,
      status: row.status,
      createdAt: row.createdAt,
      owner: { id: row.ownerId, displayName: row.ownerDisplayName },
      category: { id: row.categoryId, name: row.categoryName },
      images: imagesByPostId.get(row.id) ?? [],
      distance: row.distanceMeters,
      relevance: row.relevanceScore ?? undefined,
    }));
  }

  private buildResponse(
    items: FeedItem[],
    sort: SortOption,
    hasNextPage: boolean,
  ) {
    const lastItem = items.at(-1);
    const nextCursor =
      hasNextPage && lastItem
        ? encodeCursor(this.toCursorFields(lastItem, sort))
        : null;

    return {
      items: items.map((item) => this.stripInternalFields(item)),
      nextCursor,
      hasNextPage,
    };
  }

  // ADR-004 (distance) and the Search Ranking V1 spec (relevance score)
  // both forbid exposing their computed sort keys in the API response, even
  // though each is needed internally for ordering and cursor continuation.
  private stripInternalFields(item: FeedItem): FeedRow {
    const post = { ...item };
    delete post.distance;
    delete post.relevance;
    return post;
  }

  /** Builds the public, sort-aware pagination cursor for the last item of a page. */
  private toCursorFields(item: FeedItem, sort: SortOption): CursorFields {
    switch (sort) {
      case SortOption.NEWEST:
        return {
          sort: SortOption.NEWEST,
          sortValue: item.createdAt.toISOString(),
          id: item.id,
        };
      case SortOption.PRICE_ASC:
      case SortOption.PRICE_DESC:
        return { sort, sortValue: item.price, id: item.id };
      case SortOption.NEAREST:
        return {
          sort: SortOption.NEAREST,
          sortValue: item.distance ?? 0,
          id: item.id,
        };
      case SortOption.RELEVANCE:
        return {
          sort: SortOption.RELEVANCE,
          sortValue: item.relevance ?? 0,
          id: item.id,
        };
    }
  }

  private hasLocationParams(query: FindPostsQueryDto): query is LocationQuery {
    return (
      query.latitude !== undefined &&
      query.longitude !== undefined &&
      query.radius !== undefined
    );
  }

  /**
   * Visibility follows the Database Constitution's Post Status Constitution
   * per-status definitions, not a blanket "ACTIVE only" rule: ACTIVE,
   * RESERVED ("remains visible"), and COMPLETED ("read-only", implicitly
   * still visible) are all visible to every caller, including anonymous
   * ones. Only PAUSED ("temporarily hidden") and DELETED ("soft deleted")
   * are hidden from the public. ADMIN callers may read any status,
   * regardless, for moderation/audit — matching the existing restore-flow
   * precedent of admins being able to `GET` a soft-deleted post.
   *
   * This was previously a blanket `status !== ACTIVE` check, which
   * incorrectly hid RESERVED and COMPLETED posts too; corrected as part of
   * the Phase 8/9 hardening pass. The feed's own `status: ACTIVE` filter
   * (`FeedQueryBuilder`/`GeoFeedQueryBuilder`, frozen by ADR-004) is a
   * separate, unrelated decision about feed *composition* and is
   * intentionally not changed by this fix — this method governs only the
   * single-post detail view.
   */
  async findOne(id: string, viewer?: User) {
    const post = await this.prisma.post.findUnique({
      where: { id },
      select: postDetailSelect,
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    const isAdmin = viewer?.role === UserRole.ADMIN;
    if (isPostHiddenFromPublic(post.status) && !isAdmin) {
      throw new NotFoundException('Post not found');
    }

    return resolveImageUrls(this.storageService, post);
  }

  async update(id: string, user: User, dto: UpdatePostDto) {
    this.assertLocationUpdateIsAtomic(dto);

    if (dto.imageKeys !== undefined) {
      this.assertImageKeysOwnedBy(dto.imageKeys, user.id);
    }

    // Populated inside the transaction below (empty array if `imageKeys` is
    // omitted, or if every submitted key was already part of the post).
    let removedImageKeys: string[] = [];

    const updated = await this.prisma.$transaction(async (tx) => {
      const post = await tx.post.findUnique({
        where: { id },
        select: {
          id: true,
          ownerId: true,
          status: true,
        },
      });

      this.assertPostCanBeChanged(
        post,
        user,
        'Only active posts can be updated',
      );

      const data: Prisma.PostUpdateInput = {};

      if (dto.title !== undefined) {
        data.title = dto.title;
      }

      if (dto.price !== undefined) {
        data.price = dto.price;
      }

      if (dto.description !== undefined) {
        data.description = dto.description;
      }

      if (dto.details !== undefined) {
        data.details = dto.details as Prisma.InputJsonValue;
      }

      if (dto.latitude !== undefined && dto.longitude !== undefined) {
        data.latitude = dto.latitude;
        data.longitude = dto.longitude;
      }

      if (dto.imageKeys !== undefined) {
        const existingImages = await tx.postImage.findMany({
          where: { postId: post.id },
          select: { imageUrl: true },
        });
        const submittedKeys = new Set(dto.imageKeys);
        removedImageKeys = existingImages
          .map((image) => image.imageUrl)
          .filter((key) => !submittedKeys.has(key));

        data.images = {
          deleteMany: {},
          create: dto.imageKeys.map((imageKey, displayOrder) => ({
            imageUrl: imageKey,
            displayOrder,
          })),
        };
      }

      return tx.post.update({
        where: { id: post.id },
        data,
        select: postDetailSelect,
      });
    });

    // Storage/Deletion Rule: the `PostImage` row removal above has already
    // committed by this point — Postgres, not R2, is the source of truth
    // (Database Constitution). R2 cleanup is intentionally best-effort here:
    // a failed delete leaves (at worst) an orphaned R2 object, never a
    // `PostImage` row pointing at storage that no longer exists, which is
    // the safer of the two possible failure directions.
    await Promise.allSettled(
      removedImageKeys.map((key) => this.storageService.delete(key)),
    );

    return resolveImageUrls(this.storageService, updated);
  }

  async remove(id: string, user: User) {
    await this.prisma.$transaction(async (tx) => {
      const post = await tx.post.findFirst({
        where: {
          id,
          status: PostStatus.ACTIVE,
        },
        select: {
          id: true,
          ownerId: true,
        },
      });

      if (!post) {
        throw new NotFoundException('Post not found');
      }

      if (post.ownerId !== user.id) {
        throw new ForbiddenException();
      }

      await tx.post.update({
        where: { id: post.id },
        data: {
          status: PostStatus.DELETED,
          deletedAt: new Date(),
        },
      });
    });
  }

  /**
   * Owner restore within the 30-day window. Clears `deletedAt` and returns
   * the post to ACTIVE. Expired restores are rejected with 403.
   */
  async restore(id: string, user: User) {
    return this.prisma.$transaction(async (tx) => {
      const post = await tx.post.findUnique({
        where: { id },
        select: {
          id: true,
          ownerId: true,
          status: true,
          deletedAt: true,
        },
      });

      if (!post) {
        throw new NotFoundException('Post not found');
      }

      if (post.ownerId !== user.id) {
        throw new ForbiddenException();
      }

      if (post.status !== PostStatus.DELETED || !post.deletedAt) {
        throw new ConflictException('Only deleted posts can be restored');
      }

      const restoreDeadline = post.deletedAt.getTime() + RESTORE_WINDOW_MS;
      if (Date.now() > restoreDeadline) {
        throw new ForbiddenException('Restore window has expired');
      }

      return tx.post.update({
        where: { id: post.id },
        data: {
          status: PostStatus.ACTIVE,
          deletedAt: null,
        },
        select: postDetailSelect,
      });
    });
  }

  async create(user: User, dto: CreatePostDto) {
    this.assertImageKeysOwnedBy(dto.imageKeys, user.id);

    return this.prisma.$transaction(async (tx) => {
      const category = await tx.category.findUnique({
        where: { id: dto.categoryId },
        select: { id: true },
      });

      if (!category) {
        throw new NotFoundException('Category not found');
      }

      const post = await tx.post.create({
        data: {
          ownerId: user.id,
          categoryId: dto.categoryId,
          title: dto.title,
          price: dto.price,
          description: dto.description,
          details: dto.details as Prisma.InputJsonValue,
          latitude: dto.latitude,
          longitude: dto.longitude,
          images: {
            create: dto.imageKeys.map((imageKey, displayOrder) => ({
              imageUrl: imageKey,
              displayOrder,
            })),
          },
        },
        select: postDetailSelect,
      });

      return resolveImageUrls(this.storageService, post);
    });
  }

  /**
   * `POST /posts/images` (Image Storage V1 spec): validates presence,
   * derives a user-namespaced key server-side — the client never supplies or
   * influences it (ADR-005, Storage: "Object keys are namespaced by
   * uploader") — and delegates content validation, WebP compression, and R2
   * storage to `StorageService`. Does not attach the image to any post;
   * attachment happens when the returned key is later submitted in
   * `imageKeys` on a create/update request.
   */
  async uploadImage(
    user: User,
    file?: Express.Multer.File,
  ): Promise<{ key: string }> {
    if (!file) {
      throw new BadRequestException('No image file provided');
    }

    const key = `posts/${user.id}/${randomUUID()}.webp`;
    await this.storageService.upload(file.buffer, key, file.mimetype);

    return { key };
  }

  /**
   * Ownership Rules #2/#3: ownership is derived solely from each key's own
   * `posts/{userId}/` namespace prefix, never from anything the client
   * separately asserts. A key that is merely well-formed but was never
   * actually uploaded (or belongs to another user) is rejected identically —
   * the Error Handling table requires the service to not distinguish "not
   * mine" from "does not exist".
   */
  private assertImageKeysOwnedBy(imageKeys: string[], userId: string): void {
    const ownedPrefix = `posts/${userId}/`;
    const hasUnownedKey = imageKeys.some((key) => !key.startsWith(ownedPrefix));

    if (hasUnownedKey) {
      throw new BadRequestException(
        'One or more images are not owned by the requesting user',
      );
    }
  }

  private assertLocationUpdateIsAtomic(dto: UpdatePostDto) {
    const hasLatitude = dto.latitude !== undefined;
    const hasLongitude = dto.longitude !== undefined;

    if (hasLatitude !== hasLongitude) {
      throw new BadRequestException(
        'latitude and longitude must be updated together',
      );
    }
  }

  private assertPostCanBeChanged(
    post: MutablePostState | null,
    user: User,
    inactivePostMessage: string,
  ): asserts post is MutablePostState {
    if (!post) {
      throw new NotFoundException('Post not found');
    }

    if (post.ownerId !== user.id) {
      throw new ForbiddenException();
    }

    if (post.status !== PostStatus.ACTIVE) {
      throw new ConflictException(inactivePostMessage);
    }
  }
}
