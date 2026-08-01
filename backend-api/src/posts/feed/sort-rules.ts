import { SortOption } from './sort-option.enum';

export type SortDirection = 'asc' | 'desc';

interface ColumnSortRule {
  readonly kind: 'column';
  readonly column: 'createdAt' | 'price';
  readonly direction: SortDirection;
}

interface DistanceSortRule {
  readonly kind: 'distance';
  readonly direction: 'asc';
}

interface RelevanceSortRule {
  readonly kind: 'relevance';
  readonly direction: 'desc';
}

export type SortRule = ColumnSortRule | DistanceSortRule | RelevanceSortRule;

/**
 * Single source of truth for each sort mode's ordering field and tie-break
 * direction (ADR-004 Business Rule 5: every sort mode's secondary field is
 * `id`, always applied in the same direction as the primary field).
 *
 * Consumed by `GeoFeedQueryBuilder` to render SQL `ORDER BY`/cursor
 * conditions. `FeedQueryBuilder` (the Prisma-input path) may adopt this
 * same table the next time it is modified, so both builders derive their
 * per-sort-mode behavior from one place instead of two independently
 * maintained copies.
 */
export const SORT_RULES: Record<SortOption, SortRule> = {
  [SortOption.NEWEST]: {
    kind: 'column',
    column: 'createdAt',
    direction: 'desc',
  },
  [SortOption.PRICE_ASC]: { kind: 'column', column: 'price', direction: 'asc' },
  [SortOption.PRICE_DESC]: {
    kind: 'column',
    column: 'price',
    direction: 'desc',
  },
  [SortOption.NEAREST]: { kind: 'distance', direction: 'asc' },
  // Per the Search Ranking V1 Scoring Contract: relevance score descending,
  // then `id` descending. Requires `search` to be non-empty (enforced by
  // `FindPostsQueryDto`, not by this table).
  [SortOption.RELEVANCE]: { kind: 'relevance', direction: 'desc' },
};
