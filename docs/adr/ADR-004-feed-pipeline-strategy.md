# ADR-004: Geospatial Feed Architecture

## Status

Accepted

## Date

2026-07-23

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
4. Supported sort modes are: newest-first (default), price ascending, price descending, and nearest-first.
5. Every sort mode has a fixed, deterministic tie-break field so that no two listings ever compare as equal:
   - Newest-first: `createdAt` descending, then `id` descending.
   - Price ascending: `price` ascending, then `id` ascending.
   - Price descending: `price` descending, then `id` descending.
   - Nearest-first: distance ascending, then `id` ascending.
6. Cursors are sort-mode-specific and opaque. A cursor issued for one sort mode is rejected as invalid if used against a request for a different sort mode.
7. Filters are applied in a fixed precedence: status, then category, then search, then location, then sort.
8. Pagination never produces duplicate records and never omits a record that matches the requested filters, at any page depth.
9. Computed distance is not included in API responses.
10. Search matches case-insensitively against listing title, description, and category name.

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
- Keyword search relevance and performance are a separate concern from geospatial search and are addressed independently of this decision.

---

## Related ADRs

- ADR-001: Feature-Based Architecture
- ADR-002: Feed API Design
- ADR-003: Error Handling Strategy
