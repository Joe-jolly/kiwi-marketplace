import { Prisma } from '@prisma/client';

/**
 * Deterministic relevance scoring expression shared by both feed paths —
 * `FeedQueryBuilder`'s no-location RELEVANCE query and
 * `GeoFeedQueryBuilder`'s location-present RELEVANCE query — per the Search
 * Ranking V1 Scoring Contract (`docs/specifications/search-ranking-v1-spec.md`):
 *
 * - Deterministic and finite: `pg_trgm`'s `similarity(text, text)` is a pure
 *   function of its two string arguments — same inputs, same PostgreSQL
 *   version/extension, same output — and always returns a value in `[0, 1]`,
 *   never `NULL`/`NaN` for non-null column values. The weighted sum below is
 *   therefore always a finite real number in `[0, 6]`.
 * - Monotonic with match quality: match quality *is* trigram similarity here
 *   — a stronger textual match against a given field always yields a
 *   strictly higher `similarity()` value for that field, and each field's
 *   contribution is weighted by how strong a search-intent signal it is
 *   (title > description > category name, mirroring ADR-004 Business
 *   Rule 10's field ordering).
 * - Computed by the database, identically in both execution paths — this
 *   function is the single source of truth for the expression text so the
 *   two paths cannot silently diverge.
 *
 * Backed by the GIN trigram indexes created in migration
 * `20260801130000_enable_pg_trgm_search_indexes`
 * (`Post_title_trgm_idx`, `Post_description_trgm_idx`,
 * `Category_name_trgm_idx`) — see `ROADMAP.md` Phase 6, "pg_trgm Search
 * Optimization". Those same indexes also let the planner accelerate the
 * unchanged `ILIKE '%term%'` match predicate (`gin_trgm_ops` supports both
 * `similarity()`/`%` and `LIKE`/`ILIKE`), so enabling `pg_trgm` improves both
 * filtering and scoring without changing match semantics.
 *
 * Callers must only invoke this with a non-empty `search` term — `search`
 * is required whenever `sort=RELEVANCE` (enforced by `FindPostsQueryDto`).
 */
export function buildRelevanceScoreExpression(search: string): Prisma.Sql {
  // Rounded to 9 decimal places for the same reason cursors round-trip
  // safely: the unrounded sum of three `similarity()` calls (each `real`,
  // single-precision) is an exact `double precision` value with up to
  // ~17 significant decimal digits, but that value is read out to Node
  // (via `$queryRaw`), Base64/JSON-encoded into the pagination cursor, and
  // later sent back as a query parameter on the *next* page to be compared
  // (`score = cursor.sortValue`) against a *freshly recomputed* score for
  // the same row. That round trip has been observed to lose precision in
  // the last 1-2 significant digits, which silently breaks exact-equality
  // tie-breaking — a tied row could fail to compare equal to its own
  // cursor, causing cursor pagination to loop forever between tied rows.
  // Rounding to 9 decimal places keeps far more precision than
  // `similarity()`'s real-world resolution ever needs while comfortably
  // surviving the round trip intact, so `score = cursor.sortValue`
  // reliably holds whenever two rows are meant to tie.
  return Prisma.sql`ROUND((
    (similarity("Post"."title", ${search})::double precision * 3) +
    (similarity("Post"."description", ${search})::double precision * 2) +
    (similarity("Category"."name", ${search})::double precision * 1)
  )::numeric, 9)::double precision`;
}
