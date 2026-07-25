# Kiwi Marketplace MVP Roadmap (V3)

## Phase 1 - Foundation

- [x] Project Setup
- [x] PostgreSQL
- [x] Prisma
- [x] Users
- [x] Authentication
- [x] Validation
- [x] CurrentUser Decorator
- [x] Error Handling

---

## Phase 2 - Marketplace Core

- [x] Database Schema
- [x] Category Seed
- [x] Create Post
- [x] Get Posts
- [x] Get Post Details
- [x] Update Post
- [x] Delete Post

---

## Phase 3 - PostGIS Foundation

### Environment

- [x] Docker Compose
- [x] PostGIS Docker Image
- [x] PostgreSQL + PostGIS Environment
- [x] Prisma Compatibility Verification

### Database

- [x] Enable PostGIS Extension
- [x] Add Geography Column
- [x] Configure SRID 4326
- [x] Generated Geography Column
- [x] Create GiST Spatial Index

### Schema Improvements

- [ ] Fix PostImage Cascade Delete
- [ ] Resolve deletedAt Strategy
- [ ] Validate Latitude Range
- [ ] Validate Longitude Range
- [ ] Enforce Atomic Location Update

---

## Phase 4 - Geo Search Architecture

### Feed Engine

- [x] Remove Haversine-based Feed
- [x] Remove Chunk Loading
- [x] Remove MAX_CHUNK_ITERATIONS
- [x] Remove In-memory Distance Sorting

### Geo Query Engine

- [x] Build Unified Geo Query
- [x] Radius Search
- [x] Nearby Search
- [x] Distance Sorting
- [x] Category + Geo Filtering
- [x] Search + Geo Filtering
- [x] Keyset Pagination
- [x] Cursor Based Distance Pagination

---

## Phase 5 - Architecture Verification

### Correctness

- [x] Verify No Skipped Records
- [x] Verify Stable Cursor Pagination
- [x] Verify Duplicate-free Feed

### Performance

- [x] EXPLAIN ANALYZE
- [x] Verify GiST Index Usage
- [x] Benchmark 1K Posts
- [x] Benchmark 10K Posts
- [x] Benchmark 100K Posts
- [x] Benchmark 500K Posts

### Cleanup

- [x] Remove Legacy Feed Logic
- [x] Remove Feature Flags
- [x] Update ADR
- [x] Update Architecture Documents

---

## Phase 6 - Marketplace Experience

- [ ] Search
- [ ] Category Filter
- [ ] Distance Filter
- [ ] Feed Sorting
- [ ] Search Ranking
- [ ] pg_trgm Search Optimization

---

## Phase 7 - Image Storage

- [ ] Cloudflare R2 Integration
- [ ] Upload API
- [ ] Delete Image
- [ ] Image Validation

---

## Phase 8 - Favorites

- [ ] Favorite Post
- [ ] Remove Favorite
- [ ] My Favorites

---

## Phase 9 - Chat

- [ ] Chat Creation
- [ ] Messages
- [ ] Socket.IO
- [ ] Unread Count
- [ ] Message Read Status

---

## Phase 10 - Notifications

- [ ] Notification Entity
- [ ] Notification API
- [ ] Push Notification

---

## Phase 11 - Admin Panel

- [ ] React Admin Setup
- [ ] Admin Authentication
- [ ] Dashboard
- [ ] Category Management
- [ ] User Management
- [ ] Post Moderation

---

## Phase 12 - Mobile App

- [ ] React Native Setup
- [ ] Authentication
- [ ] Home Feed
- [ ] Post Details
- [ ] Create Post
- [ ] Chat
- [ ] Favorites
- [ ] Notifications

---

## Phase 13 - Production

- [ ] Environment Configuration
- [ ] Docker Production
- [ ] Logging
- [ ] Nginx
- [ ] HTTPS
- [ ] Deploy Backend
- [ ] Deploy Admin
- [ ] Monitoring
- [ ] Backup Strategy

---

## Phase 14 - Release

- [ ] Build Android APK
- [ ] Google Play Store

---

## Phase 15 - Feed Improvements

- [ ] Include RESERVED Posts in Feed
- [ ] Display Reserved Badge
- [ ] Follow Reserved Posts
- [ ] Notify Followers when Reserved Posts become Active Again
