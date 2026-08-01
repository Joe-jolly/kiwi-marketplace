export enum SortOption {
  NEWEST = 'NEWEST',
  PRICE_ASC = 'PRICE_ASC',
  PRICE_DESC = 'PRICE_DESC',
  NEAREST = 'NEAREST',
  // Requires a non-empty `search` term (see `FindPostsQueryDto`). Added via
  // the ADR-004 amendment recorded in `docs/specifications/search-ranking-v1-spec.md`.
  RELEVANCE = 'RELEVANCE',
}
