# Search Ranking V1 Specification

## Status

Approved and fully implemented. The contract (validation, ordering, tie-break, cursor, response shape) was frozen here and implemented in Step 3; the deferred scoring formula was finalized with `pg_trgm` in Phase 6 Track B (see "Finalized Scoring Implementation (pg_trgm) — Phase 6, Track B" below).

---

# Overview

This specification defines the complete, implementation-grade behavior of the `RELEVANCE` sort mode approved in Decision Record `DR-PHASE6-SEARCH-RANKING-001` and recorded as an amendment to `docs/adr/ADR-004-feed-pipeline-strategy.md`.

ADR-004 (as amended) defines **why** `RELEVANCE` exists and the architectural pattern it follows. This specification defines **exactly how it must behave**, in enough detail to implement and verify against, mirroring the level of detail `docs/specifications/feed-engine-v3-spec.md` established for `NEAREST`.

This specification does not change any behavior of `NEWEST`, `PRICE_ASC`, `PRICE_DESC`, or `NEAREST`, and does not change the feed's response shape.

---

# Scope

In scope:

- The `RELEVANCE` sort mode: validation, ordering, tie-break, and cursor behavior.
- Search's role as an order-affecting input (only for `RELEVANCE`) versus a filter-only input (every other sort mode).
- Behavior across both feed execution paths (no-location / Prisma, location-present / raw SQL), per ADR-004.

Out of scope (explicitly deferred, not part of this contract):

- The exact relevance score formula/algorithm (e.g. trigram similarity via `pg_trgm`, weighted field matching, etc.). This is an engineering decision made at implementation time, constrained only by the Scoring Contract below.
- `pg_trgm` extension enablement, indexing, or any other search-performance optimization. Tracked separately in `ROADMAP.md` Phase 6 ("pg_trgm Search Optimization").
- Any change to `categoryId`, location, status, or pagination-size filtering/validation.
- Any change to the response contract, error contract, or cursor wire format beyond adding one new discriminated case.

---

# Supported Query Parameters (delta from Feed Engine V3)

`docs/specifications/feed-engine-v3-spec.md`'s Supported Query Parameters table is extended as follows:

| Parameter | Required | Description |
|---|---|---|
| sort | No | Feed sorting (default `NEWEST`); now includes `RELEVANCE` |

No parameter is renamed, removed, or repurposed. `search` remains the same optional string parameter; only its interaction with `sort=RELEVANCE` is new.

---

# Validation Rules

1. `sort=RELEVANCE` requires a non-empty `search` term. A request with `sort=RELEVANCE` and no `search`, or `search` empty after trimming, is rejected with `400 Bad Request` — the same validation pattern `FindPostsQueryDto` already applies to `NEAREST` requiring location parameters.
2. `search` remains optional for every other sort mode, unchanged.
3. No new validation rule applies to `categoryId`, location parameters, `limit`, or `cursor` as a result of this specification.
4. Supplying `search` together with `sort=RELEVANCE` and location parameters is valid: location continues to act as a filter (radius containment), exactly as it does for every other sort mode, per ADR-004 Business Rule 7's filter precedence (status → category → search → location → sort).

---

# Search Behavior by Sort Mode

| Sort mode | Effect of `search` |
|---|---|
| `NEWEST` (default) | Filter only — narrows result set, no effect on order |
| `PRICE_ASC` | Filter only |
| `PRICE_DESC` | Filter only |
| `NEAREST` | Filter only |
| `RELEVANCE` | Filter **and** order — result set is narrowed to matches, then ordered by relevance score |

This table is the authoritative statement of ADR-004 Business Rule 10 (as amended): search is unconditionally a filter, and is additionally an ordering input only under `RELEVANCE`.

The match predicate itself (case-insensitive partial match against `title`, `description`, `category.name`, per ADR-004 Business Rule 10 and Feed Engine V3's Search section) is unchanged and identical for all five sort modes — `RELEVANCE` does not use a different or looser match predicate than the other sort modes use for filtering.

---

# Sort Mode and Tie-Break

Extending Feed Engine V3's Sort Modes and Tie-Breaks table:

| Sort | Order |
|---|---|
| `NEWEST` (default) | `createdAt` DESC, then `id` DESC |
| `PRICE_ASC` | `price` ASC, then `id` ASC |
| `PRICE_DESC` | `price` DESC, then `id` DESC |
| `NEAREST` | distance ASC, then `id` ASC |
| `RELEVANCE` | relevance score DESC, then `id` DESC |

As with every other sort mode, ordering must be fully deterministic — no two rows may ever compare as equal — so cursor pagination cannot skip or duplicate a record.

---

# Scoring Contract (constraints on the deferred formula)

The relevance score's exact formula is not frozen by this specification (see Scope), but any implementation must satisfy all of the following:

1. **Deterministic**: for a fixed dataset and fixed `search` term, the score for a given row is always the same value.
2. **Finite and totally ordered**: the score is a finite numeric value (no `NaN`, no `NULL` for a matching row), so descending order and the tie-break comparison are always well-defined.
3. **Monotonic with match quality**: a closer/stronger match to `search` must never score lower than a weaker match, for whatever definition of "match quality" the chosen formula uses.
4. **Computed and ordered by the database**, not by application code — consistent with ADR-004's treatment of distance, and with the Technical/API Constitutions' requirement that sorting and search execution belong to the backend.
5. **Identical scoring logic in both execution paths** (no-location and location-present) for the same row and the same `search` term, so that adding or removing location parameters never changes relevance order among the same matched rows.

---

# Cursor Contract

Extends the existing cursor wire format defined in Feed Engine V3 (Base64-encoded JSON, versioned, discriminated on `sort`, containing exactly `{ v, sort, sortValue, id }`). No field is added, removed, or renamed at the wire level.

New discriminated case:

```
{
  v: 1,
  sort: "RELEVANCE",
  sortValue: <number>,  // relevance score for the row the page ended on
  id: <string>
}
```

Rules:

- `sortValue` must be a finite number (same validation shape already used for `PRICE_ASC`/`PRICE_DESC`/`NEAREST` cursors).
- Continuation condition, consistent with descending score + descending `id` tie-break: `(score < cursor.sortValue) OR (score = cursor.sortValue AND id < cursor.id)`.
- A `RELEVANCE` cursor is rejected as invalid if replayed against a request with any other `sort` value, and vice versa — unchanged rejection behavior and message ("Cursor does not match requested sorting strategy.") from Feed Engine V3 / ADR-004 Business Rule 6.
- The `search` term is **not** part of the cursor payload. As with `categoryId` today, changing `search` mid-pagination-walk is a new query, not a continuation; the API does not guarantee any relationship between pages fetched with different `search` values.

---

# API / Response Contract

Unchanged from Feed Engine V3:

```json
{
  "items": [],
  "nextCursor": "string | null",
  "hasNextPage": true
}
```

- No `score` or `relevance` field is added to `items` or to the response envelope, per ADR-004 Business Rule 11 (mirroring Business Rule 9's treatment of distance).
- `items`' per-record shape (`postFeedSelect` or its raw-SQL equivalent) is unchanged.
- No new top-level response field is introduced by this specification.

---

# Behavior for Both Feed Paths

Per ADR-004's two-execution-path model (no-location Prisma path vs. location-present raw-SQL path):

- **No-location path**: when `sort=RELEVANCE`, this path must express the score computation, `ORDER BY`, and cursor continuation condition for relevance — even though it otherwise stays Prisma-first. Whether this requires a scoped raw-SQL expression (consistent with ADR-004's "one sanctioned exception" being about the query that reads `location`, not a blanket ban on any raw SQL) or a Prisma-expressible equivalent is an implementation decision for Step 3, constrained by the Scoring Contract's requirement of identical scoring logic across both paths.
- **Location-present path**: `RELEVANCE` composes with the existing radius predicate exactly as `NEWEST`/`PRICE_ASC`/`PRICE_DESC` already do when location parameters are supplied without `NEAREST` — location filters the candidate set, `RELEVANCE` orders it. Distance is not returned and does not influence relevance order.
- In both paths, filter precedence remains status → category → search → location → sort (ADR-004 Business Rule 7), unchanged by this specification.

---

# Error Handling

Extends Feed Engine V3's Error Handling section; no new error condition beyond one new validation case:

| Condition | Result |
|---|---|
| `sort=RELEVANCE` without non-empty `search` | `400 Bad Request` (DTO validation) |
| Cursor with `sort=RELEVANCE` replayed against a different requested `sort` | `400 Bad Request`, `"Cursor does not match requested sorting strategy."` |
| Cursor with `sort` other than `RELEVANCE` replayed against `sort=RELEVANCE` | `400 Bad Request`, same message |
| Malformed/undecodable cursor | `400 Bad Request`, existing invalid-cursor behavior, unchanged |

---

# Non-Goals

To prevent scope creep during implementation (Step 3+):

- No relevance-weighted blending with distance, price, or recency (rejected "hybrid score" alternative — see ADR-004 amendment).
- No `pg_trgm` enablement or index creation as part of freezing this contract — tracked separately in `ROADMAP.md`.
- No change to `NEWEST`, `PRICE_ASC`, `PRICE_DESC`, or `NEAREST` behavior, validation, or cursor shape.
- No relevance score exposed in any response, log line intended for clients, or error message.
- No new query parameter (e.g. a minimum-score threshold) — `RELEVANCE` reuses `search`, `categoryId`, location, `limit`, and `cursor` exactly as they exist today.

---

# Definition of Done (for Step 3 implementation, previewed here for traceability)

Full acceptance criteria belong to the Step 3 execution plan, not this frozen contract. At a minimum, Step 3 must demonstrate, against this specification:

1. `sort=RELEVANCE` without `search` is rejected; with `search`, it is accepted.
2. A full pagination walk under `sort=RELEVANCE` (both with and without location parameters) is complete, duplicate-free, and deterministically ordered by the Scoring Contract's rules.
3. A `RELEVANCE` cursor is rejected when replayed under any other `sort`, and vice versa.
4. No response payload, under any sort mode, ever contains a relevance score field.
5. `search` continues to behave as filter-only, with zero order effect, under `NEWEST`, `PRICE_ASC`, `PRICE_DESC`, and `NEAREST`.

---

# Finalized Scoring Implementation (pg_trgm) — Phase 6, Track B

This section records the formula chosen to satisfy the Scoring Contract above. It is implementation detail, not a contract amendment: the Scoring Contract's five constraints remain the only binding requirements, and a future change to this formula (e.g. re-tuning weights) does not require re-freezing this specification, provided all five constraints still hold.

**Status**: Implemented (Phase 6, Track B — pg_trgm Search Optimization).

**Formula** (`backend-api/src/posts/feed/relevance-score.sql.ts`):

```sql
ROUND((
  (similarity("Post"."title", :search)::double precision * 3) +
  (similarity("Post"."description", :search)::double precision * 2) +
  (similarity("Category"."name", :search)::double precision * 1)
)::numeric, 9)::double precision
```

Where `similarity(text, text)` is PostgreSQL's `pg_trgm` trigram-similarity function, returning a real number in `[0, 1]`.

- **Replaces** the interim weighted `ILIKE` CASE expression (binary 0/weight per field) used from Step 3 until Track B.
- **Range**: `[0, 6]` — finite, never `NULL`/`NaN` for a matching row, satisfying Scoring Contract #2.
- **Weights** (3 / 2 / 1 for title / description / category name) are unchanged from the interim implementation, preserving the same field-priority intent (ADR-004 Business Rule 10) while replacing the binary match signal with continuous trigram similarity, satisfying Scoring Contract #3.
- **`ROUND(..., 9)`** is required, not cosmetic: the unrounded sum is an exact `double precision` value with up to ~17 significant decimal digits, but that value round-trips through `$queryRaw` and the Base64-encoded pagination cursor before being sent back as a query parameter on the next page. That round trip was found (via Track B's tie-break e2e test) to lose precision in the last 1-2 significant digits, which silently broke exact-equality tie-breaking: a genuinely tied row could fail to compare equal to its own cursor value, and cursor pagination looped forever between two tied rows. Rounding to 9 decimal places keeps far more precision than `similarity()` ever needs while comfortably surviving the round trip intact, restoring Scoring Contract #1 (deterministic) in practice, not just in principle.
- **Match predicate is unchanged**: filtering still uses `ILIKE '%search%'` against `title`, `description`, `category.name` (see "Search Behavior by Sort Mode" above) — only the ordering key changed. `similarity()` is used solely for scoring/ordering, never for filtering, so no row that would have matched under the interim implementation stops matching, and vice versa.
- **Indexing**: backed by three GIN trigram indexes (migration `20260801130000_enable_pg_trgm_search_indexes`): `Post_title_trgm_idx`, `Post_description_trgm_idx`, `Category_name_trgm_idx`, created via `CREATE EXTENSION IF NOT EXISTS pg_trgm` + `CREATE INDEX ... USING GIN (<column> gin_trgm_ops)`. These same indexes also allow the query planner to accelerate the unchanged `ILIKE '%term%'` filter predicate.
- **Both feed paths** (`FeedQueryBuilder.buildRelevanceQuery` and `GeoFeedQueryBuilder.build`) call the same exported `buildRelevanceScoreExpression`, so this is the only place the formula is defined, satisfying Scoring Contract #5.

---

# Related Documents

- ADR-004: Geospatial Feed Architecture (Amendment: Search Ranking (RELEVANCE))
- Decision Record: `DR-PHASE6-SEARCH-RANKING-001`
- Feed Engine V3 Specification (`docs/specifications/feed-engine-v3-spec.md`) — base contract this specification extends
- `docs/03-technical-constitution.md` §16 (Search Constitution)
- `docs/05-api-constitution.md` §9–12 (Pagination, Sorting, Filtering, Search Constitutions)
- `ROADMAP.md` Phase 6 (Marketplace Experience)
