# Feed Engine V3 Specification

## Status

Approved

---

# Overview

Feed Engine V3 replaces the Haversine / chunk-loading implementation of the feed with the PostGIS-based architecture decided in ADR-004.

The goal of this specification is to define the complete, implementation-grade behavior of the feed under the new architecture before implementation begins.

ADR-004 defines **why** PostGIS was chosen and the high-level storage/indexing/querying model. This specification defines **exactly how the feed must behave**, in enough detail to implement and verify against, with no remaining ambiguity.

This specification does not introduce any new business rule, any new sort mode, or any change to the feed's external contract. Every behavior stated below is either taken directly from ADR-004 or preserved unchanged from the current, already-implemented behavior.

---

# Scope

In scope:

- The query, filtering, sorting, and pagination pipeline behind `GET /posts`.
- The storage and indexing of `Post` location data.
- Cursor pagination for every supported sort mode, including the NEAREST cursor.

Out of scope (explicitly not addressed by this document or this milestone):

- Any other module (Chat, Favorites, Notifications, Reports, Categories module, etc.).
- Any new business rule, sort mode, or filter.
- Any change to the external response contract of `GET /posts`.
- Unrelated schema hygiene items currently in `BACKLOG.md` (`PostImage` cascade delete, `deletedAt` strategy) — these are not part of the PostGIS migration and are tracked separately.

---

# Relationship to Feed Engine V2 Specification

This specification supersedes `docs/specifications/feed-engine-v2-spec.md` for every behavior it redefines (storage, query execution, distance calculation). The V2 spec's Haversine formula and Chunk Loading Strategy sections are obsolete under ADR-004.

Formally marking the V2 specification as superseded/archived is a documentation cleanup action, not an implementation action — it belongs in Step 12 (Cleanup), not here, and is called out explicitly so it isn't lost.

---

# Supported Query Parameters

Unchanged from the current implementation:

| Parameter | Required | Description |
|---|---|---|
| search | No | Search keyword |
| categoryId | No | Category filter |
| latitude | Conditional | User latitude |
| longitude | Conditional | User longitude |
| radius | Conditional | Search radius, in meters |
| sort | No | Feed sorting (default `NEWEST`) |
| cursor | No | Pagination cursor |
| limit | No | Requested page size (default 20, max 50) |

Location parameters are all-or-nothing: if one is supplied, all three must be supplied. `NEAREST` sorting requires location parameters; requesting it without them is a validation error. Both rules are already enforced by `FindPostsQueryDto` and are unchanged by this migration.

---

# Storage Model

- `Post.latitude` and `Post.longitude` remain the source of truth and remain plain, Prisma-writable columns. No write path (`create`, `update`) changes.
- A `location` column of type `geography(Point, 4326)` is added as a column generated automatically from `latitude`/`longitude`. Application code never writes to it directly.
- A GiST index is created on `location`.
- This is a pure addition to the schema. No existing column, type, or constraint is altered or removed.

---

# Query Model

Two execution paths remain, mirroring the one sanctioned exception ADR-004 defines — the raw SQL exception applies only to the query that reads `location`:

- **No location parameters supplied**: the request does not need `location` at all. This path continues to use Prisma exactly as it does today — status, category, and search filters, sort-aware `ORDER BY`, and a sort-aware cursor `WHERE` condition, all pushed into a single Prisma query.
- **Location parameters supplied**: status, category, search, the radius predicate, and (for `NEAREST`) the indexed distance ordering are all composed into a single parameterized raw SQL query. This is the one place in the codebase, per ADR-004, permitted to bypass Prisma. This path fully replaces the current chunk-loading loop: it is one query producing one page directly, not a buffered scan that is filtered and re-sorted afterward.

Both paths must return results through the existing `postFeedSelect` shape (or its raw-SQL equivalent) — no additional fields are introduced.

---

# Sort Modes and Tie-Breaks

Unchanged from ADR-004 Business Rule 5 — restated here as the exact ordering each path must produce:

| Sort | Order |
|---|---|
| `NEWEST` (default) | `createdAt` DESC, then `id` DESC |
| `PRICE_ASC` | `price` ASC, then `id` ASC |
| `PRICE_DESC` | `price` DESC, then `id` DESC |
| `NEAREST` | distance ASC, then `id` ASC |

Every sort mode's ordering must be fully deterministic — no two rows may ever compare as equal — so that cursor pagination cannot skip or duplicate a record.

---

# Cursor Pagination

Unchanged wire format: Base64-encoded JSON, versioned, discriminated on `sort`, containing exactly `{ v, sort, sortValue, id }`. This is unchanged because it is already opaque and already sort-mode-specific per ADR-004 — no new decision is required here.

What changes internally: for `NEAREST`, `sortValue` is now the distance computed by the PostGIS query itself (indexed, exact) rather than an application-computed Haversine value from a chunk scan. The cursor's `WHERE`-equivalent condition for `NEAREST` is now expressed directly inside the single raw SQL query (distance greater than the cursor's distance, or equal distance with `id` greater than the cursor's `id`), rather than resolved by re-scanning from the start of the table and filtering in the application layer.

A cursor issued under one sort mode remains invalid under any other sort mode. The existing rejection behavior is unchanged:

```
400 Bad Request
"Cursor does not match requested sorting strategy."
```

---

# Search

Case-insensitive partial match against `title`, `description`, and `category.name` only — no JSON fields, per ADR-004 Business Rule 10. This must be expressed identically in both execution paths: as a Prisma `OR`/`contains` condition in the no-location path, and as the equivalent SQL predicate inside the single raw query in the location path.

---

# Filter Precedence

ADR-004 states filters are applied in the order: status, category, search, location, sort. This is a statement about the order the WHERE conditions are composed in code for readability and consistency between the two paths — filters are combined with logical AND, so this order does not change which rows match. It does not permit, for example, skipping the search filter when location is present, or vice versa; all applicable filters always apply together.

---

# Response Format

Unchanged:

```json
{
  "items": [],
  "nextCursor": "string | null",
  "hasNextPage": true
}
```

Computed distance is never included in the response, in either execution path, per ADR-004 Business Rule 9.

---

# Error Handling

Unchanged from current behavior:

- Invalid or unsupported query parameters → `400 Bad Request` (existing DTO validation).
- Cursor that fails to decode, or that does not match the requested sort mode → `400 Bad Request`, `"Cursor does not match requested sorting strategy."` (or the existing invalid-cursor message).
- Unexpected server errors → `500 Internal Server Error`.

No new error condition is introduced by this migration.

---

# What Changes vs. What Stays the Same

Removed:

- The Haversine distance calculation (`haversine.util.ts`).
- The Chunk Loading Strategy and `MAX_CHUNK_ITERATIONS`.
- In-memory, application-layer scanning/filtering/re-sorting of candidate rows for the location-present path.

Unchanged:

- `FindPostsQueryDto` and all its validation rules.
- The cursor wire format and its opacity/versioning.
- The response contract (`items` / `nextCursor` / `hasNextPage`).
- The `status: ACTIVE` filter, search fields, and category filter.
- All non-feed `Post` read/write paths (`findOne`, `create`, `update`, `remove`) — these do not touch `location` and are unaffected.

---

# Correctness Requirements

Restating ADR-004 Business Rule 8 as testable invariants. For every sort mode, with and without location parameters, and for every supported combination of search/category/location filters:

1. No record matching the request's filters is ever skipped across a full pagination walk, at any page depth.
2. No record is ever returned twice across a full pagination walk.
3. Page order is byte-for-byte deterministic for a fixed dataset and fixed request parameters.

These three invariants are the acceptance bar for Step 9 (Correctness Verification) and must be checked, not assumed.

---

# Performance Requirements

Stated at a high level here; concrete thresholds are defined in Step 2's Definition of Done:

- Every query that filters or orders by location must use the GiST index (verified via `EXPLAIN ANALYZE`, not assumed).
- Producing a page must require exactly one database round trip, regardless of sort mode or how sparse the matching data is — this is the property that replaces chunk-loading's variable, data-dependent round-trip count.

---

# Non-Goals

To prevent scope creep during implementation:

- No change to the maximum radius, default limit, or any other currently-validated bound.
- No new sort mode, filter, or query parameter.
- No inclusion of `RESERVED` posts in the feed (tracked separately in `ROADMAP.md` Phase 15, explicitly out of scope here).
- No schema change beyond the `location` column and its GiST index.
- No change to any module other than the feed query pipeline.

---

# Definition of Done

Feed Engine V3 is complete only when every gate below is satisfied. Each gate states not just the requirement but how it is checked — nothing here is satisfied by inspection or assumption.

## 1. Build & Static Correctness Gates

- `npm run build` succeeds with zero errors.
- TypeScript reports zero errors, including against the regenerated Prisma client.
- `npm run lint` passes.
- No `any` introduced to work around the raw-SQL/Prisma boundary; the raw query's result rows are typed explicitly.

## 2. Migration Gates

- The Prisma migration applies cleanly to both an empty database and a database pre-populated with existing `Post` rows, with zero data loss.
- After migration, `latitude` and `longitude` are byte-identical to their pre-migration values for every existing row.
- For every row, the generated `location` column is verified (by direct query, not assumption) to equal the geography point derived from that row's `latitude`/`longitude`.
- The GiST index on `location` is confirmed to exist via a direct catalog query (e.g. `pg_indexes`), not assumed from the migration file alone.

## 3. Correctness Verification

This is the direct, checkable form of the three invariants stated in the specification's Correctness Requirements section:

- A deterministic verification harness (adapting the reference-implementation method used in the earlier NEAREST-pagination audit) runs a **full pagination walk** — repeatedly following `nextCursor` until `hasNextPage` is `false` — for:
  - Every sort mode (`NEWEST`, `PRICE_ASC`, `PRICE_DESC`, `NEAREST`).
  - With and without location parameters.
  - At least one representative combination of search + category + location together.
- For each walk, the harness asserts against the real database (not an in-memory simulation, since correctness now depends on the actual PostGIS query planner and index):
  - The set of ids returned across the full walk exactly equals the independently-computed expected set for those filters (no skipped record).
  - No id appears more than once across the full walk (no duplicate record).
  - The returned order exactly matches the sort mode's defined tie-break rule.
- Boundary cases are explicitly included, not left to chance: zero matching rows, exactly one page of results, exactly `limit + 1` rows, and a dataset large enough to require multiple pages.
- Existing, already-implemented validation behavior is regression-checked, not just assumed to still work: NEAREST-without-location rejection, all-or-nothing location parameters, and cursor rejection across mismatched sort modes.

## 4. Performance Verification

- `EXPLAIN (ANALYZE, BUFFERS)` is captured for the location-present query, for every sort mode, and must show the GiST index being used (an Index Scan or Bitmap Index Scan against it) — a sequential scan on `location` fails this gate.
- Benchmarks are run at the dataset sizes already specified in `ROADMAP.md` Phase 5: 1K, 10K, 100K, and 500K posts.
- Producing one page requires exactly one database round trip, at every dataset size — confirmed by query-count instrumentation during the benchmark, not by code inspection alone.
- **Engineering-set latency target** (this specific number is my engineering judgment applying ADR-004's qualitative requirement — "performance that scales to hundreds of thousands of listings" — since no prior document states an exact figure; it is not a business commitment and can be revisited if real usage patterns later demand otherwise): p95 latency for a single feed page request, at 500K posts, under 300ms on the benchmark hardware. This is a build/verification bar for this migration, not a production SLA.

## 5. API Contract Regression Gate

- For equivalent requests, the response JSON shape is structurally identical before and after the migration: `items` (same per-item fields as `postFeedSelect` produces today), `nextCursor`, `hasNextPage`. No field is added, removed, or renamed.
- Distance is confirmed absent from every response payload, for every sort mode, including `NEAREST`.
- Any existing automated tests continue to pass; this migration does not reduce test coverage.

## 6. Cleanup Gates

- `haversine.util.ts` is deleted, along with `MAX_CHUNK_ITERATIONS` and the chunk-loading loop.
- Any temporary rollout flag introduced to cut over safely is removed once the migration is confirmed complete — no flag is left permanently in the codebase (per `ROADMAP.md` Phase 5's "Remove Feature Flags").
- No dead code, unused exports, or leftover references to the removed Haversine/chunk-loading path remain anywhere in `src/posts`.

## 7. Documentation Notes (not gates on this milestone)

- `ADR-004` requires no further changes — it already documents the target architecture this milestone implements. `ROADMAP.md`'s Phase 5 "Update ADR" item is already satisfied by the existing ADR-004.
- Marking `feed-engine-v2-spec.md` as superseded, and checking off the relevant `ROADMAP.md` items, are Step 12 (Cleanup) actions, not conditions of this Definition of Done.

---

# Related Documents

- ADR-004: Geospatial Feed Architecture
- Feed Engine V2 Specification (superseded for the behaviors redefined above)
- ROADMAP.md (Phases 3–5)
- BACKLOG.md
