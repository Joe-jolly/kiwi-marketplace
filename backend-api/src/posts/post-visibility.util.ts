import { PostStatus } from '@prisma/client';

/**
 * Visibility follows the Database Constitution's Post Status Constitution
 * per-status definitions, not a blanket "ACTIVE only" rule: ACTIVE,
 * RESERVED ("remains visible"), and COMPLETED ("read-only", implicitly
 * still visible) are all visible to every caller, including anonymous
 * ones. Only PAUSED ("temporarily hidden") and DELETED ("soft deleted")
 * are hidden from the public.
 *
 * A standalone function (not inlined in `PostsService.findOne()`) so the
 * same rule can be reused anywhere else "is this post visible to a
 * non-admin viewer" matters — currently `PostsService.findOne()` and
 * `FavoritesService` (both the favorite-add visibility gate and the
 * `isAvailable` flag on a favorited post).
 */
export function isPostHiddenFromPublic(status: PostStatus): boolean {
  return status === PostStatus.PAUSED || status === PostStatus.DELETED;
}
