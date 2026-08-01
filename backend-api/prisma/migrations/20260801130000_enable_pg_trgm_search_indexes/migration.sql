-- Hand-written migration. See `docs/specifications/search-ranking-v1-spec.md`
-- (Scoring Contract) and `ROADMAP.md` Phase 6 ("pg_trgm Search Optimization").
--
-- Prisma cannot express PostgreSQL extensions, non-default operator classes
-- (`gin_trgm_ops`), or GIN indexes on those operator classes natively in
-- `schema.prisma` without diverging from how this project already treats
-- the one other non-standard index (`Post_location_idx`, ADR-004) — so, for
-- the same reason, this file is authored and reviewed by hand rather than
-- generated from a schema change. `schema.prisma` is intentionally left
-- unchanged by this migration.

-- Enable the pg_trgm extension (idempotent; safe to re-run). Provides:
--   - `similarity(text, text)` — the function the finalized RELEVANCE
--     scoring expression uses (see `relevance-score.sql.ts`).
--   - `gin_trgm_ops` — the GIN operator class the indexes below use, which
--     also allows the planner to accelerate the existing `ILIKE '%term%'`
--     search predicate (unchanged match semantics — see the Search Ranking
--     V1 spec's "Search Behavior by Sort Mode": the match predicate itself
--     does not change, only how RELEVANCE orders the matched rows).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN trigram indexes on the three approved searchable fields (ADR-004
-- Business Rule 10 / Technical Constitution §16 / Database Constitution
-- §17: title, description, category name — no other field is searchable).
CREATE INDEX "Post_title_trgm_idx" ON "Post" USING GIN ("title" gin_trgm_ops);
CREATE INDEX "Post_description_trgm_idx" ON "Post" USING GIN ("description" gin_trgm_ops);
CREATE INDEX "Category_name_trgm_idx" ON "Category" USING GIN ("name" gin_trgm_ops);
