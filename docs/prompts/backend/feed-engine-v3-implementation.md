# Feed Engine V3 — Implementation Plan (File-by-File)

## Status

Approved (Step 3 of the Feed Engine V3 execution plan)

## Purpose

This is the exact, file-by-file change list for implementing Feed Engine V3. It governs Steps 4–12 of the execution plan. It does not introduce any behavior beyond what `docs/specifications/feed-engine-v3-spec.md` (Steps 1–2) and ADR-004 already define — it only decides *where in the codebase* each already-approved behavior is implemented, and how responsibilities are split between files. All decisions in this document are engineering/organizational (Category A): project structure, file boundaries, naming, and code reuse.

Legend: **[NEW]** created · **[MOD]** modified · **[DEL]** deleted · **[UNCHANGED]** explicitly verified to require no change.

---

## 1. Schema & Migration

| File | Change |
|---|---|
| `backend-api/prisma/schema.prisma` | **[MOD]** Declare the `postgis` extension on the datasource, add a `location` field to `Post` typed via Prisma's `Unsupported(...)` (since Prisma cannot model a generated `geography` column natively), and declare the GiST index. Exact Prisma syntax (how much is expressible in `schema.prisma` vs. hand-written) is resolved during Step 5 — this entry only fixes *that* the file changes and *why*. |
| `backend-api/prisma/migrations/<timestamp>_add_geography_location/migration.sql` | **[NEW]** Hand-written migration: enable the `postgis` extension, add the generated `location geography(Point,4326)` column derived from `latitude`/`longitude`, create the GiST index. Per ADR-004, this file is reviewed by hand rather than fully auto-generated. |

No other part of `schema.prisma` changes. `User`, `Category`, `PostImage`, and every existing `Post` column are untouched.

---

## 2. Backend Source — Deleted

| File | Reason |
|---|---|
| `backend-api/src/posts/feed/haversine.util.ts` | **[DEL]** Distance is now computed by PostGIS inside the query, not in the application layer. |
| `backend-api/src/posts/feed/feed-sorter.ts` | **[DEL]** Its only responsibilities — in-memory sorting of chunk-fetched candidates and `isAfterCursor` re-scanning for `NEAREST` — no longer exist once the chunk-loading path is removed. Nothing else consumes this class. |

---

## 3. Backend Source — New

| File | Responsibility |
|---|---|
| `backend-api/src/posts/feed/geo-feed-query.builder.ts` | **[NEW]** `GeoFeedQueryBuilder`. Builds the single parameterized raw SQL query for the location-present path: status + category + search + radius predicate + sort-mode ordering + cursor condition + limit, joining `owner` and `category` inline (both are many-to-one, trivial SQL joins). Uses Prisma's `Prisma.sql` tagged-template helper for safe parameterization — never raw string concatenation. Returns typed rows plus `distanceMeters` (internal only, for cursor construction; stripped before the response, same as today). |
| `backend-api/test/feed-v3-pagination.e2e-spec.ts` | **[NEW]** The correctness-verification harness required by the Definition of Done (Step 9): full pagination walks per sort mode, with/without location, asserting no-skip/no-duplicate/deterministic-order against a real PostGIS-backed database. Placed alongside the existing `test/app.e2e-spec.ts`, reusing the existing e2e test infrastructure rather than introducing a new one. |
| `backend-api/scripts/feed-v3-benchmark.ts` | **[NEW]** One-off benchmark script for Step 10 (Performance Verification): seeds the 1K/10K/100K/500K datasets already specified in `ROADMAP.md`, runs `EXPLAIN (ANALYZE, BUFFERS)`, and records latency. Not part of the build or CI — a manual tool, explicitly scoped for removal or relocation to a permanent `scripts/` home during Step 12 Cleanup (default: remove, since it is not needed once the benchmark evidence is captured). |

---

## 4. Backend Source — Modified

| File | Change |
|---|---|
| `backend-api/src/posts/posts.service.ts` | **[MOD]** Remove `findAllWithDistanceFilter`, `MAX_CHUNK_ITERATIONS`, `buildScanCursor`, and the `LocationQuery`/chunk-loop logic. Add a new private method (equivalent role to today's `findAllWithDistanceFilter`) that calls `GeoFeedQueryBuilder` + `this.prisma.$queryRaw`, then hydrates `images` via one additional Prisma query keyed by the returned post ids (see the clarification note below), and maps the result into the exact same `FeedItem` shape the Prisma path already produces. `buildResponse`, `toCursorFields`, and `omitDistance` stay as shared code used by both paths — this is the mechanism that prevents the response-shaping logic from being duplicated. `findAllDbNative` is unchanged. |
| `backend-api/src/posts/feed/feed-query.builder.ts` | **[MOD]** Remove `buildChunkSize` and `CHUNK_MULTIPLIER` (obsolete). `buildWhere`, `buildCursorWhere`, `buildOrderBy`, and `buildTake` are otherwise unchanged — they continue to serve the no-location Prisma path exactly as today. |
| `backend-api/src/posts/posts.module.ts` | **[MOD]** Remove the `FeedSorter` provider, add the `GeoFeedQueryBuilder` provider. |

---

## 5. Backend Source — Unchanged (verified)

Listed explicitly so nothing is assumed by omission:

- `backend-api/src/posts/posts.controller.ts` — already thin, calls `postsService.findAll(query)` unconditionally.
- `backend-api/src/posts/dto/find-posts-query.dto.ts`, `create-post.dto.ts`, `update-post.dto.ts` — no validation rule changes.
- `backend-api/src/posts/feed/cursor.util.ts` — wire format and validation are sort-mode-generic; they don't care whether `NEAREST`'s `sortValue` originated from PostGIS or Haversine.
- `backend-api/src/posts/feed/sort-option.enum.ts` — no new sort mode.
- `backend-api/src/posts/post.select.ts` — `postFeedSelect` continues to define the shared output shape both paths must produce; `postDetailSelect` and `mutablePostSelect` are for `findOne`/mutation paths, untouched by this migration.

---

## 6. Environment / Tooling (executed in Step 4, listed here for completeness)

| File | Purpose |
|---|---|
| `docker-compose.yml` | **[NEW]** Local PostGIS-enabled PostgreSQL service for development, since none exists today. |
| `.env.example` | **[NEW]** Documents required environment variables (`DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `PORT`) — currently absent from the repo; created as a byproduct of standing up the new environment, not a scope expansion. |

---

## 7. Engineering Clarification: "One Query Per Page"

The Definition of Done states producing a page requires "exactly one database round trip." To avoid ambiguity during implementation: this refers to the *filter/sort/paginate* operation — the property that replaces chunk-loading's variable, retry-based round-trip count with a single, direct, complete query. It does not require forcing the one-to-many `images` collection into the same SQL statement via `array_agg`/`json_agg`. `images` will continue to be hydrated by one additional, batched query keyed by the page's post ids — exactly how the current no-location Prisma path already behaves for a nested one-to-many `select` under the hood. This keeps the raw-SQL query focused and readable without any correctness or measurable performance cost at MVP scale, and keeps both paths structurally symmetric.

## 8. Engineering Note: Avoiding Cursor-Logic Duplication

`FeedQueryBuilder` (Prisma path) and `GeoFeedQueryBuilder` (raw-SQL path) both need per-sort-mode ordering and cursor-comparison logic. To avoid two independent, drift-prone implementations of the same tie-break rules, both builders should be implemented against a single shared source of truth for "column + direction per sort mode" (for example, a small shared lookup table), with each builder responsible only for rendering that into its own representation — a Prisma input object on one side, a SQL fragment on the other. The exact shape of this shared table is a Step 6 implementation detail, not decided further here.

---

## 9. Execution Order Cross-Reference

| Step | Files primarily touched |
|---|---|
| Step 4 (Environment) | `docker-compose.yml`, `.env.example` |
| Step 5 (Schema migration) | `schema.prisma`, new `migration.sql` |
| Step 6 (Unified query) | `geo-feed-query.builder.ts` |
| Step 7 (Replace Haversine/chunk-loading) | `posts.service.ts`, `posts.module.ts`, delete `haversine.util.ts` and `feed-sorter.ts` |
| Step 8 (Cursor logic) | Verification only — `cursor.util.ts` is unchanged; confirm `NEAREST` cursor construction in `posts.service.ts` uses the new distance source |
| Step 9 (Correctness verification) | `test/feed-v3-pagination.e2e-spec.ts` |
| Step 10 (Performance verification) | `scripts/feed-v3-benchmark.ts` |
| Step 11 (API contract check) | No file changes expected; verification-only against `posts.controller.ts` responses |
| Step 12 (Cleanup) | Remove any temporary rollout flag, remove/relocate `scripts/feed-v3-benchmark.ts`, mark `feed-engine-v2-spec.md` superseded, check off `ROADMAP.md` Phases 3–5 |

---

## Related Documents

- ADR-004: Geospatial Feed Architecture
- `docs/specifications/feed-engine-v3-spec.md` (Steps 1–2)
- `ROADMAP.md` (Phases 3–5)
