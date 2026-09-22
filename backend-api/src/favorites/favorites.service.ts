import { Injectable, NotFoundException } from '@nestjs/common';
import type { User } from '@prisma/client';
import { CursorPaginationQueryDto } from '../common/dto/cursor-pagination-query.dto';
import {
  decodeKeysetCursor,
  encodeKeysetCursor,
} from '../common/pagination/keyset-cursor.util';
import { isPostHiddenFromPublic } from '../posts/post-visibility.util';
import { postDetailSelect } from '../posts/post.select';
import { resolveImageUrls } from '../posts/resolve-image-urls.util';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

/** Scopes `GET /favorites`'s cursor so it can't be replayed against another
 * single-sort-mode cursor endpoint (currently `GET /posts/me`). */
const FAVORITES_CURSOR_PURPOSE = 'favorites-mine';

@Injectable()
export class FavoritesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
  ) {}

  /**
   * Idempotent by construction (`upsert`) — API Constitution §24: "Duplicate
   * favorites must not be created... idempotent behavior is preferred."
   *
   * A post can only be favorited if it's visible to this viewer in the
   * first place — `isPostHiddenFromPublic` is the same predicate
   * `PostsService.findOne()` uses, so a post you couldn't `GET` can't be
   * favorited either. No admin bypass: there's no product need for an
   * admin to favorite a hidden post on a user's behalf.
   */
  async add(postId: string, user: User) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, status: true },
    });

    if (!post || isPostHiddenFromPublic(post.status)) {
      throw new NotFoundException('Post not found');
    }

    const favorite = await this.prisma.favorite.upsert({
      where: { userId_postId: { userId: user.id, postId } },
      create: { userId: user.id, postId },
      update: {},
      select: { postId: true, createdAt: true },
    });

    return favorite;
  }

  /**
   * Idempotent by construction (`deleteMany`) — removing your own favorite
   * always succeeds, even if it was never favorited, or if the underlying
   * post has since become hidden (PAUSED/DELETED): un-favoriting is a
   * cleanup action on the viewer's own saved list, not a view action, so
   * it intentionally does not re-run the visibility gate `add()` uses.
   */
  async remove(postId: string, user: User): Promise<void> {
    await this.prisma.favorite.deleteMany({
      where: { userId: user.id, postId },
    });
  }

  /**
   * "My Favorites": cursor-paginated (`Favorite.createdAt desc,
   * Favorite.postId desc` — approved Step 1 decision), full post detail per
   * item (same shape as `GET /posts/me`/`GET /posts/:id`, via the shared
   * `resolveImageUrls`). A favorited post that's since become PAUSED or
   * DELETED is not dropped from the list — it's kept, with `isAvailable:
   * false`, per the approved "keep the favorite, show it as an unavailable
   * placeholder" decision. Cascade deletes (`onDelete: Cascade` on both
   * `Favorite` relations) guarantee there is never a `Favorite` row whose
   * `post` no longer exists, so no null-post case to handle here.
   */
  async findMine(user: User, query: CursorPaginationQueryDto) {
    const cursor = decodeKeysetCursor(FAVORITES_CURSOR_PURPOSE, query.cursor);

    const cursorWhere = cursor
      ? {
          OR: [
            { createdAt: { lt: cursor.sortValue } },
            { createdAt: cursor.sortValue, postId: { lt: cursor.id } },
          ],
        }
      : undefined;

    const rows = await this.prisma.favorite.findMany({
      where: cursorWhere
        ? { userId: user.id, ...cursorWhere }
        : { userId: user.id },
      orderBy: [{ createdAt: 'desc' }, { postId: 'desc' }],
      take: query.limit + 1,
      select: {
        postId: true,
        createdAt: true,
        post: { select: postDetailSelect },
      },
    });

    const hasNextPage = rows.length > query.limit;
    const pageRows = hasNextPage ? rows.slice(0, query.limit) : rows;

    const items = pageRows.map((row) => ({
      ...resolveImageUrls(this.storageService, row.post),
      isAvailable: !isPostHiddenFromPublic(row.post.status),
    }));

    const lastRow = pageRows.at(-1);
    const nextCursor =
      hasNextPage && lastRow
        ? encodeKeysetCursor(
            FAVORITES_CURSOR_PURPOSE,
            lastRow.createdAt,
            lastRow.postId,
          )
        : null;

    return { items, nextCursor, hasNextPage };
  }
}
