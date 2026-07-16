# Technical Backlog

## Database

- [ ] Add `onDelete: Cascade` to `PostImage -> Post` relation and create a migration.
- [ ] Review all relation `onDelete` behaviors before production release.
- [ ] Add composite index for location-based search after implementing distance filter.

## Prisma

- [ ] Migrate Prisma seed configuration from `package.json` to `prisma.config.ts` after upgrading to Prisma 7.
- [ ] Upgrade Prisma from v6 to v7 after MVP is completed.

## API

- [ ] Introduce Response DTOs instead of returning Prisma entities directly.
- [ ] Standardize API response format across all endpoints.

## Posts

- [ ] Replace image URLs with Cloudflare R2 upload flow.
- [ ] Validate `details` against `Category.schema` before creating a post.
- [ ] Add ownership check before Update/Delete endpoints.
- [ ] Implement soft delete.

## Posts Feed

- [ ] Add cursor pagination to GET /posts.
- [ ] Sort posts by distance when user location is available.
- [ ] Add category filter.
- [ ] Add keyword search.
- [ ] Add price range filter.
- [ ] Add response thumbnail optimization.

## Categories

- [ ] Implement CategoriesModule.
- [ ] Add Admin API for category management.
- [ ] Replace seed-based category management with Admin Panel.

## Search

- [ ] Cursor Pagination.
- [ ] Distance Filter.
- [ ] Full-text Search.
- [ ] Category Filter.

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
