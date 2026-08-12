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
