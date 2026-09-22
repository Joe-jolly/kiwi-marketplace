# Technical Backlog

## Database

- [x] Add `onDelete: Cascade` to `PostImage -> Post` relation and create a migration.
- [ ] Review all relation `onDelete` behaviors before production release.
- [ ] Add composite index for location-based search after implementing distance filter.

## Prisma

- [ ] Migrate Prisma seed configuration from `package.json` to `prisma.config.ts` after upgrading to Prisma 7.
- [ ] Upgrade Prisma from v6 to v7 after MVP is completed.

## API

- [ ] Introduce Response DTOs instead of returning Prisma entities directly.
- [ ] Standardize API response format across all endpoints.

## Posts

- [x] Replace image URLs with Cloudflare R2 upload flow (`imageKeys` contract, server-side upload/compression/ownership/diff-and-delete; see `docs/specifications/image-storage-v1-spec.md` and `docs/adr/ADR-005-image-storage-architecture.md`).
- [ ] Validate `details` against `Category.schema` before creating a post.
- [ ] Add ownership check before Update/Delete endpoints.
- [x] Implement soft delete.

## Posts Feed

- [x] Add cursor pagination to GET /posts.
- [x] Sort posts by distance when user location is available.
- [x] Add category filter.
- [x] Add keyword search.
- [ ] Add price range filter.
- [ ] Add response thumbnail optimization.

## Categories

- [ ] Implement CategoriesModule.
- [ ] Add Admin API for category management.
- [ ] Replace seed-based category management with Admin Panel.

## Search

- [x] Cursor Pagination.
- [x] Distance Filter.
- [x] Category Filter.
- [x] Search Ranking (`sort=RELEVANCE`, per `docs/specifications/search-ranking-v1-spec.md`).
- [x] pg_trgm Search Optimization (finalized `similarity()`-based scoring + GIN trigram indexes; see `docs/specifications/search-ranking-v1-spec.md`, "Finalized Scoring Implementation").

## Infrastructure

- [ ] Configure `.gitattributes` for consistent LF/CRLF handling.
- [ ] Configure Docker for local development.
- [ ] Configure Cloudflare R2.
- [ ] Configure Nginx + HTTPS before production.

## Testing

- [ ] Add unit tests.
- [ ] Add e2e tests.
- [ ] Add seed reset script for testing.

## Refactoring

- [ ] Review module boundaries before production.
- [ ] Review DTO validation rules.
- [ ] Review error messages for consistency.

## Restoring DELETED posts

- [x] Add `deletedAt DateTime?` to `Post` to record deletion time and support future restore, retention policies, and automated cleanup jobs.
- [x] Owner restore within 30 days (`POST /posts/:id/restorations`).
- [x] Owner listing of restorable deleted posts (`GET /posts/me`).

## Technical Hardening (Phase 8)

- [x] Fix `PostsService.create()` response shape: was using `tx.post.create({ include: { images: true } })`, which diverged from the frozen `docs/specifications/image-storage-v1-spec.md` contract (`create()`/`update()` both return `postDetailSelect`) — missing nested `owner`/`category` objects, over-exposed raw `PostImage` rows. Now uses `select: postDetailSelect`, matching `update()`.
- [x] Fix TypeScript `RELEVANCE` exhaustiveness gap in `test/feed-v3-pagination.e2e-spec.ts`'s local sort comparator — missing `case SortOption.RELEVANCE` produced a `number | undefined` return type, caught only by a project-wide `tsc --noEmit` (not by `nest build`, which excludes `test/`).
- [x] Correct local `.env` `DATABASE_URL` — was pointing at a stale, unmigrated local Postgres install (port 5432) instead of the Docker PostGIS dev container (port 5433). Root cause of recurring, previously-misdiagnosed "transient" `Post.deletedAt does not exist` e2e failures across earlier phases.
- [x] Repository hygiene: removed untracked `POC_CLEANUP_REPORT.md` (one-time, completed PoC teardown report with no ongoing reference value) and `docs/AI_AGENT_GUIDE.md` (redundant with the always-applied `.cursor/rules/backend.mdc`).
- [ ] `npm audit`: 7 high-severity findings in `backend-api` (`brace-expansion`, `fast-uri`, `js-yaml` — dev-only, `eslint`/`jest` transitive deps; `deepmerge-ts`/`effect` — reachable only through `prisma`'s optional peer-dependency chain via `@prisma/config`, not invoked by any runtime code path). Confirmed non-runtime-exploitable during the Phase 8 audit. **Deferred** — no fix available without a breaking Prisma change (`npm audit fix --force` offers `prisma@6.12.0`, a downgrade from the current `6.16.3`). Revisit alongside "Upgrade Prisma from v6 to v7 after MVP is completed" above.

## Favorites (Phase 9)

- [x] Add `Favorite` model: composite PK `(userId, postId)`, `onDelete: Cascade` on both the `User` and `Post` relations, `@@index([postId])` — mirrors the existing `PostImage` bridge-table precedent (no separate `id`, no `updatedAt`, since rows are create/delete-only). The composite PK itself satisfies the Database Constitution's `UNIQUE(user_id, post_id)` mandate (§10, §21).
- [x] `POST /posts/:id/favorites` and `DELETE /posts/:id/favorites` — idempotent by construction (`upsert` / `deleteMany`), per the API Constitution's Idempotency Constitution (§24: "Duplicate favorites must not be created"). Favoriting reuses `PostsService.findOne()`'s visibility rule (`isPostHiddenFromPublic`) — a post you cannot view cannot be favorited either.
- [x] `GET /favorites` ("My Favorites") — cursor-paginated (`Favorite.createdAt desc, postId desc`), full post detail per item (same shape as `GET /posts/me`/`GET /posts/:id`), plus an `isAvailable` flag: a favorited post that later becomes PAUSED or soft-deleted stays in the list as a flagged, unavailable placeholder rather than silently disappearing (approved product decision).
- [x] Extracted `resolveImageUrls()`, `isPostHiddenFromPublic()`, and a shared single-sort-mode keyset cursor codec/DTO (`CursorPaginationQueryDto`) out of `PostsService` into standalone utilities under `src/posts/` and `src/common/`, reused by both `PostsService` (unchanged behavior) and the new `FavoritesModule`, to avoid duplicating this logic across the two modules.
- Favorite counts (e.g. "N people favorited this listing") are explicitly **not** MVP — `docs/10-mvp-scope-lock.md` §11 lists only Add Favorite, Remove Favorite, and a Favorites Screen as Approved.
- This phase's Step 0 design review also surfaced and fixed 3 pre-existing inconsistencies, corrected before building Favorites on top of them (not new Favorites behavior): the API response-envelope documentation (`docs/05-api-constitution.md` §5, amended to match the bare-response contract every endpoint has implemented since Phase 1, rather than a `{success, data}` envelope that was never actually built); `GET /posts/me` pagination (was an unpaginated array, now cursor-paginated like every other list endpoint, per §9); and `PostsService.findOne()`'s visibility rule (was hiding RESERVED and COMPLETED posts in addition to PAUSED/DELETED, when the Database Constitution's Post Status Constitution only hides the latter two).
