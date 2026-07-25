# Feed Engine V2 Specification

## Status

**Superseded** by `docs/specifications/feed-engine-v3-spec.md` (Feed Engine V3) and ADR-004 (Geospatial Feed Architecture).

Do not implement from this document. The Haversine formula, Chunk Loading Strategy, and application-layer distance path described here are obsolete. Retained only as historical reference.

---

# Overview

Feed Engine V2 is the next evolution of the Kiwi Marketplace feed system.

The goal of this specification is to define the complete behavior of the feed before implementation.

This document describes business rules, validation rules, sorting behavior, cursor pagination, distance filtering, response format, and implementation constraints.

Architecture decisions are documented separately in ADR-004.

This specification defines **how the feature must behave**, while ADR-004 defines **why the architecture was chosen**.

---

# Scope

Feed Engine V2 includes:

- Search
- Category Filter
- Distance Filter
- Feed Sorting
- Cursor Pagination
- Chunk Loading Strategy

This specification applies only to the feed endpoint.

---

# Supported Query Parameters

| Parameter  | Required    | Description            |
| ---------- | ----------- | ---------------------- |
| search     | No          | Search keyword         |
| categoryId | No          | Category filter        |
| latitude   | Conditional | User latitude          |
| longitude  | Conditional | User longitude         |
| radius     | Conditional | Search radius (meters) |
| sort       | No          | Feed sorting           |
| cursor     | No          | Pagination cursor      |
| limit      | No          | Requested page size    |

Location parameters are all-or-nothing.

If one is provided, all must be provided.

---

# Validation Rules

## Latitude

-90 ≤ latitude ≤ 90

## Longitude

-180 ≤ longitude ≤ 180

## Radius

radius > 0

Unit:

Meters

## Sort

Allowed values:

- NEWEST
- PRICE_ASC
- PRICE_DESC
- NEAREST

Unknown values return:

400 Bad Request

## Cursor

Cursor must belong to the currently requested sorting strategy.

Otherwise:

400 Bad Request

Message:

```
Cursor does not match requested sorting strategy.
```

---

# Feed Pipeline

The pipeline always executes in the following order.

```
Query Validation
        │
        ▼
Search Filter
        │
        ▼
Category Filter
        │
        ▼
Database Chunk Fetch
        │
        ▼
Distance Filter
        │
        ▼
Feed Sorting
        │
        ▼
Cursor Pagination
        │
        ▼
Response
```

This order must never change.

---

# Search

Search performs a case-insensitive partial match against:

- title
- description
- category name

Search does not include JSON fields in MVP.

---

# Category Filter

Category filtering happens inside the database query.

---

# Distance Filter

Distance filtering is optional.

If latitude, longitude and radius are not provided:

Distance filtering is skipped.

Distance is calculated using the Haversine Formula.

Internal calculations use double precision.

Distance is not included in the API response during MVP.

---

# Chunk Loading Strategy

Distance filtering happens after database retrieval.

To avoid returning partially filled pages, the backend loads additional chunks when necessary.

Current MVP configuration:

```ts
const CHUNK_MULTIPLIER = 3;
```

Database chunk size:

```
requestedLimit × CHUNK_MULTIPLIER
```

Maximum chunk iterations:

```ts
const MAX_CHUNK_ITERATIONS = 5;
```

If enough posts cannot be collected after the maximum number of iterations, the backend returns all collected posts.

---

# Feed Sorting

Supported sorting modes:

- NEWEST
- PRICE_ASC
- PRICE_DESC
- NEAREST

Default:

NEWEST

Sorting is always deterministic.

---

# Stable Sorting Rules

NEWEST

- createdAt DESC
- id DESC

PRICE_ASC

- price ASC
- id ASC

PRICE_DESC

- price DESC
- id DESC

NEAREST

- distance ASC
- id ASC

The secondary field is always used as the tie-break field.

Stable sorting is mandatory for correct cursor pagination.

---

# Cursor Pagination

Cursor pagination is supported for every sorting strategy.

Cursor fields:

| Sort       | Cursor Fields  |
| ---------- | -------------- |
| NEWEST     | createdAt + id |
| PRICE_ASC  | price + id     |
| PRICE_DESC | price + id     |
| NEAREST    | distance + id  |

Cursor payload contains only the minimum information required for pagination.

Cursor includes:

- version
- sorting mode
- sorting field
- id

Cursor is encoded as Base64 JSON.

---

# Invalid Cursor

The backend never ignores an invalid cursor.

If the cursor sorting mode differs from the requested sorting mode:

Response:

400 Bad Request

Example:

Cursor:

PRICE_ASC

Request:

NEWEST

↓

Invalid Request

---

# Compatibility Rules

The following combinations must work correctly.

Search + Category

Search + Distance

Category + Distance

Search + Category + Distance

Each combination must support all sorting modes.

---

# Price

Price remains required during MVP.

Future category-specific validation may allow price to become optional for service categories.

This change is outside the scope of MVP.

---

# Response Format

The response format remains unchanged.

```json
{
  "items": [],
  "nextCursor": "...",
  "hasNextPage": true
}
```

---

# Error Handling

Invalid query parameters

↓

400 Bad Request

Invalid cursor

↓

400 Bad Request

Unknown sorting mode

↓

400 Bad Request

Unexpected server errors

↓

500 Internal Server Error

---

# Service Responsibilities

```
PostsService
    │
    ▼
FeedQueryBuilder
    │
    ▼
Prisma
    │
    ▼
DistanceFilter
    │
    ▼
FeedSorter
    │
    ▼
CursorBuilder
```

Each component has exactly one responsibility.

Single Responsibility Principle must be preserved.

---

# Performance Constraints

The implementation must:

- Minimize database queries.
- Avoid unnecessary memory allocations.
- Avoid duplicate calculations.
- Keep pagination deterministic.
- Preserve backward compatibility.
- Avoid N+1 query problems.

---

# Definition of Done

Implementation is considered complete only if:

- Build succeeds.
- TypeScript has no errors.
- ESLint passes.
- Prisma type checking passes.
- Existing APIs remain backward compatible.
- Existing tests continue to pass.
- New Bruno tests pass.
- Swagger is updated.
- Architecture follows ADR-004.
- Feature follows this specification.
- No regression is introduced.
- No hardcoded values.
- No unnecessary code duplication.
- No unnecessary use of `any`.

---

# Related Documents

- ADR-001
- ADR-002
- ADR-003
- ADR-004
- ROADMAP.md
- BACKLOG.md
