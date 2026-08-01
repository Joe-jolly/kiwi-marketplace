# ADR-004: Geospatial Feed Architecture

## Status

Accepted (amended)

## Date

2026-07-23

## Amendments

- 2026-08-01 — Added `RELEVANCE` as a supported sort mode, gated on `search`, per Decision Record `DR-PHASE6-SEARCH-RANKING-001`. See "Amendment: Search Ranking (RELEVANCE)" below. Business Rules 4, 5, and 10 are updated accordingly; a new Business Rule 11 is added.

---

## Context

Kiwi Marketplace is a location-based marketplace. The feed is the primary discovery surface, and nearby search is a first-class product requirement, not an optional enhancement.

The feed must support, at any scale:

- Keyword search across listing title, description, and category
- Category filtering
- Radius-based nearby search
- Multiple sort strategies, including nearest-first
- Deterministic cursor pagination with no duplicate or skipped records, at any page depth

Distance between two geographic coordinates is a geodesic (curved-earth) calculation. Rather than approximating this in application code (for example, using the Haversine formula) and filtering results after they have already been retrieved, Kiwi computes, indexes, and queries distance natively inside PostgreSQL using the PostGIS extension. This is why the architecture below has no separate "fetch a batch, then filter by distance, then sort" stages: geospatial filtering and ordering are database-native, indexed operations, composed into the same query as every other feed filter.

---

## Problem Statement

Kiwi's geospatial architecture must guarantee, simultaneously:

- Nearest-first ordering that is mathematically correct.
- Radius search that never omits a listing that actually matches.
- Cursor pagination that is deterministic, duplicate-free, and complete at any page depth, for every sort mode.
- Performance that scales to hundreds of thousands of listings without per-request manual tuning.
- A codebase that remains Prisma-first everywhere, with only one clearly bounded, intentional exception.

---

## Decision

Kiwi stores each listing's location as a PostGIS `geography(Point, 4326)` value, indexed with a GiST spatial index, and performs all radius search, nearest-neighbor ordering, and distance-aware pagination as single, native, indexed PostgreSQL queries.

### Storage

- `Post.latitude` and `Post.longitude` are the source of truth. Every write path — creating or updating a listing — writes these plain numeric columns through Prisma exactly like any other field.
- A `location` column of type `geography(Point, 4326)` is derived automatically from `latitude`/`longitude` by the database itself (a generated column), and is never written to directly by application code. It is always consistent with `latitude`/`longitude` by construction.
- Coordinates use SRID 4326 (WGS84), matching the coordinate system produced by device GPS and geolocation APIs.
- The column type is `geography`, not `geometry`. `geography` computes real-world distance in meters over a spheroid with no manual map projection, which matches Kiwi's radius-in-meters requirement and its multi-region growth trajectory — a single flat projection would not remain accurate as Kiwi expands beyond one region.

### Indexing

- A GiST index on `location` backs both radius containment and nearest-neighbor ordering. The index adapts automatically to data density and to whatever radius a request uses, with no manual grid or bucket tuning required as the dataset grows.

### Querying

- Search, category, status, and location filters are composed into a single query. When location parameters are supplied, that query applies a radius predicate and, for nearest-first sorting, orders by the indexed distance expression.
- A requested page is produced directly by one query. No sort mode requires fetching a larger batch of candidates and discarding or re-filtering them in the application layer afterward.
- Prisma has no native mapping for `geography` columns, so the single query that reads `location` is the one place in the codebase that uses parameterized raw SQL. Every other read and every write, for `Post` and every other model, uses Prisma exactly as it does everywhere else in the codebase. This is the only sanctioned exception to Prisma-first, and it is deliberately narrow and isolated to one component.

### Pagination

- Every sort mode uses cursor-based pagination. Offset pagination is never used.
- For nearest-first sorting, the cursor pairs a computed distance value with the listing id. The same query that filters and orders a page also produces the exact continuation point for the next page, so a page boundary can never be missed or duplicated.
- For newest-first and price-based sorting, the cursor pairs `createdAt`/`price` with the listing id. An optional radius filter, when present, is simply an additional predicate in the same query rather than a different code path.

---

## Architecture Principles

- **Prisma is the default for everything.** The single raw-SQL query described above is the sole, explicitly bounded exception. It does not extend to any other model or operation.
- **Human-readable coordinates are the permanent source of truth.** `latitude`/`longitude` are never bypassed or removed; `location` is always derived, never independently written.
- **Filtering and ordering are unified, not staged.** A requested page is the direct output of one query. There is no intermediate, application-held candidate batch that gets post-processed.
- **Every sort mode is independently deterministic and pagination-safe.** A sort mode may only be added once it has a fully specified, deterministic tie-break rule and cursor strategy.

---

## Design Decisions

| Decision | Rationale |
|---|---|
| `geography(Point, 4326)` over `geometry` | Native meters-based distance with no manual projection; matches Kiwi's radius-in-meters requirement and multi-region roadmap. |
| Generated column derived from `latitude`/`longitude` | Keeps the spatial value always consistent with the Prisma-writable source columns, with zero risk of divergence and zero application-code changes to existing write paths. |
| GiST spatial index | The only index type that supports efficient radius containment and nearest-neighbor ordering on geography data; self-adapts to density and query radius without manual tuning. |
| One unified query per feed request | Removes any dependency between result completeness and how sparsely matching data is distributed; a page either exists and is returned directly, or it doesn't. |
| Distance-based keyset pagination via a single indexed query | Guarantees deterministic, complete, duplicate-free pagination for nearest-first sorting, using the same mechanism that already guarantees this for every other sort mode. |
| Raw SQL confined to one component | Preserves Prisma-first as the rule for the rest of the codebase while acknowledging the one capability Prisma cannot express. |

---

## Business Rules

These rules govern feed and search behavior and hold regardless of the underlying storage or query technology:

1. Location query parameters (`latitude`, `longitude`, `radius`) are all-or-nothing: if any one is supplied, all three must be supplied.
2. Requesting nearest-first sorting requires location parameters; requesting it without them is a validation error.
3. Radius is expressed in meters.
4. Supported sort modes are: newest-first (default), price ascending, price descending, nearest-first, and relevance (`RELEVANCE`, added by amendment — see "Amendment: Search Ranking (RELEVANCE)" below).
5. Every sort mode has a fixed, deterministic tie-break field so that no two listings ever compare as equal:
   - Newest-first: `createdAt` descending, then `id` descending.
   - Price ascending: `price` ascending, then `id` ascending.
   - Price descending: `price` descending, then `id` descending.
   - Nearest-first: distance ascending, then `id` ascending.
   - Relevance: relevance score descending, then `id` descending.
6. Cursors are sort-mode-specific and opaque. A cursor issued for one sort mode is rejected as invalid if used against a request for a different sort mode.
7. Filters are applied in a fixed precedence: status, then category, then search, then location, then sort.
8. Pagination never produces duplicate records and never omits a record that matches the requested filters, at any page depth.
9. Computed distance is not included in API responses.
10. Search matches case-insensitively against listing title, description, and category name. Search is always applied as a filter, regardless of sort mode. It additionally drives ordering only when `sort=RELEVANCE`; for every other sort mode, search narrows the result set but never changes result order.
11. Requesting relevance sorting (`sort=RELEVANCE`) requires a non-empty `search` term; requesting it without one is a validation error, mirroring Business Rule 2's treatment of nearest-first and location. Computed relevance score is not included in API responses, mirroring Business Rule 9's treatment of distance.

---

## Consequences

### Benefits

- Nearest-first ordering and radius search are computed and indexed by the database itself, so correctness does not depend on any application-level retry or buffering logic.
- A single query produces each page; the number of database round-trips per request does not depend on how sparse the matching data happens to be.
- Indexing adapts automatically to data density and to the requested radius, with no manual tuning per request.
- The service layer is simpler: one query path handles every combination of search, category, and location filters, for every sort mode.

### Trade-offs

- The `location` column and the query that reads it are outside Prisma's schema-diffing and migration generation; changes to them are made through explicit migration SQL and must be reviewed by hand.
- Local development requires a PostgreSQL instance with the PostGIS extension available.
- The single raw-SQL query is the one part of the codebase that requires SQL and spatial-query familiarity to safely modify; this cost is deliberately contained to that one component rather than spread across the codebase.

---

## Future Considerations

- Listing categories without a fixed physical location (for example, remote services) may require `location` to become nullable.
- Categories that require area or boundary matching (for example, neighborhood-bounded housing search) may require polygon-based queries in addition to point-radius search.
- If Kiwi expands into new regions, `location` provides a natural, business-aligned basis for future data partitioning.
- Keyword search relevance ordering is addressed by the amendment below. The relevance *score formula* (e.g. trigram similarity via `pg_trgm`) remains a separate, independently-scheduled optimization; this amendment freezes the contract (sort mode, validation, cursor, response shape) without freezing the formula.

---

## Amendment: Search Ranking (RELEVANCE)

### Context

Phase 6 (Marketplace Experience) requires ranking search results by relevance rather than only filtering by keyword. Prior to this amendment, `search` was filter-only: it narrowed the result set but never affected order, and the feed always ordered by `NEWEST`, `PRICE_ASC`, `PRICE_DESC`, or `NEAREST`.

This amendment was made via Category B decision `DR-PHASE6-SEARCH-RANKING-001` (Step 1 of the Phase 6 Search Ranking work), after evaluating five candidate architectures: an explicit `sort=RELEVANCE` mode, an implicit relevance override when `search` is present, a separate ranking endpoint, an always-on hybrid relevance/distance/freshness score, and client-side re-ranking.

### Decision

Kiwi adds `RELEVANCE` as a fifth, explicit sort mode, following exactly the same architectural pattern `NEAREST` already established for a sort mode with a precondition and a non-column ordering key:

- `sort=RELEVANCE` requires a non-empty `search` term, exactly as `sort=NEAREST` requires location parameters (Business Rule 11, mirroring Business Rule 2).
- Ordering is relevance score descending, then `id` descending (Business Rule 5), exactly as deterministic and pagination-safe as every other sort mode.
- The relevance score is computed and indexed by the database, never in application code, consistent with this ADR's existing treatment of distance.
- The relevance score is never included in API responses (Business Rule 11, mirroring Business Rule 9's treatment of distance).
- For every sort mode other than `RELEVANCE`, `search` continues to behave exactly as it does today: a filter only, with zero effect on ordering (Business Rule 10).

### Rejected alternatives

- **Implicit relevance when `search` is present** — rejected because it would make the `sort` parameter's meaning context-dependent (silently overridden by the presence of another parameter), which conflicts with `sort` being an explicit, self-describing parameter everywhere else in this ADR, and would make "search with `sort=PRICE_ASC`" ambiguous.
- **Separate ranking endpoint** — rejected because it would duplicate the filter, pagination, and cursor infrastructure this ADR already establishes for a single unified feed query, splitting one product surface into two independently-maintained pipelines.
- **Always-on hybrid score (relevance × distance × freshness)** — rejected as premature: it conflates multiple independent concerns this ADR and the Search/Sorting Constitutions treat as orthogonal (Business Rule 7's filter/sort precedence), and is significantly harder to specify a deterministic tie-break for.
- **Client-side re-ranking** — rejected outright: it violates the Technical and API Constitutions' requirement that sorting and search execution belong to the backend.

### Consequences of this amendment

- `SortOption`, the cursor discriminant, and both query-execution paths (Prisma no-location, raw-SQL location) each gain one new case, following the existing per-sort-mode pattern rather than introducing a new pattern.
- The exact relevance score formula is intentionally not frozen by this amendment (see Future Considerations) so that a later `pg_trgm`-backed implementation does not require a second product decision — only an engineering one, provided it stays deterministic and monotonic with match quality.
- No existing sort mode, filter, cursor, or response field changes as a result of this amendment.

See `docs/specifications/search-ranking-v1-spec.md` for the full implementation-grade contract (validation, cursor payload, query-path behavior).

---

## Related ADRs

- ADR-001: Feature-Based Architecture
- ADR-002: Feed API Design
- ADR-003: Error Handling Strategy
