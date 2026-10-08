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

## Chat (Phase 10)

- Added `Chat` and `Message` models (Database Constitution §11/§12, §20 index list, §21 constraint list): `Chat` keyed by a surrogate `id`, with `@@unique([postId, participantId])` satisfying "One Post × One Participant = One Chat" and a `participantId` index; `Message` with `@@index([chatId, createdAt])`. Both cascade-delete from `Post`/`User`, mirroring the `Favorite`/`PostImage` precedent. `Chat` is created lazily — no row exists until the first message is actually sent (Technical Constitution §18) — via a `postId_participantId` upsert-style find-or-create in `ChatsService.sendFirstMessage()`.
- `Chat.lastMessageAt` (`DateTime`, defaults to `now()`, bumped transactionally on every new message) is a Step 1 addition beyond the original schema sketch: `GET /chats` needs to sort by "most recently active conversation," not by `createdAt` (when the chat first started) — without it, a chat with a brand-new reply but an old start date would sort as stale, contradicting every chat-list UX expectation (UI-UX Constitution §17, "Unread counts must be visible" implies live, activity-ordered surfacing).
- REST endpoints (API Constitution §17 "Create Chat / Get Chats / Get Messages / Send Message", plus two Step 1 additions not in the original list): `POST /posts/:postId/messages` (create-or-reuse chat + first/next message), `POST /chats/:chatId/messages` (send, either side), `GET /chats` (cursor-paginated, `lastMessageAt desc, id desc`), `GET /chats/:chatId` (detail), `GET /chats/:chatId/messages` (cursor-paginated, `createdAt desc, id desc`), `POST /chats/:chatId/reads` (advance the caller's own read watermark — required by the read-receipt design below, not one of the API Constitution's originally-named operations).
- Unread counts are computed per viewer as a bounded (`≤ query.limit`, indexed by `[chatId, createdAt]`) set of parallel `count()` queries — one per chat row in a `GET /chats` page — rather than a single aggregate query, because each row's "unread" threshold is that row's *own* read watermark and can't be expressed as one nested Prisma `include` filter. Accepted as an MVP-scale tradeoff (API Constitution §29, "avoid N+1" — bounded by page size, not literally unbounded); revisit with a raw-SQL aggregate only if real performance data shows it matters (Technical Constitution §28, "measure before optimizing").
- **Read-receipt decision (approved Step 0 follow-up):** per-chat "last read" watermarks (`Chat.ownerLastReadAt`/`Chat.participantLastReadAt`), not a per-message `readAt` column. A message's ✓/✓✓ state (UI-UX Constitution §16) is fully derivable client-side from `message.createdAt <= theOtherSide'sWatermark` — no per-message write needed, and `unreadCount` is a single derived query per side rather than a maintained counter.
- **COMPLETED-post messaging decision (approved Step 0 follow-up):** the Database Constitution's "Completed post: read-only, no new chats" (§22) is interpreted as gating only *new chat creation* — `sendFirstMessage()` 409s only when no chat exists yet for that (post, participant) pair and the post is COMPLETED. An already-existing chat keeps accepting messages via `sendMessage()` regardless of the post's later status, since "no new chats" on a completed listing doesn't imply an in-progress conversation about that already-completed deal should go silently read-only mid-thread.
- Extracted `resolveChatRole()` (`src/chats/chat-role.util.ts`) as a small, pure, unit-tested helper: given a chat's `participantId`/`post.ownerId` and a caller id, returns `'owner' | 'participant' | null`. Reused by every authorization check (`findOne`, `findMessages`, `sendMessage`, `markRead`) instead of re-deriving the same two-way comparison four times.
- A chat that exists but the caller isn't part of is a `403`, not a `404` — unlike hidden posts, chat ids are opaque, non-enumerable UUIDs, so there's no existence-hiding benefit to a blanket 404 here.

### Socket.IO realtime layer (Phase 10 Step 2)

- Realtime technology is Socket.IO per the Technical Constitution (§3, §18) and API Constitution (§17). **REST remains the only write path and the only source of truth** — the gateway has no inbound business events at all; it only emits after `ChatsService` has already committed the corresponding REST mutation, and a realtime emit failure is caught and logged, never allowed to fail the REST call that triggered it.
- **Room model:** a single room per user, `user:<userId>`, auto-joined by every authenticated socket on connect — no per-chat rooms and no client-side subscribe/unsubscribe protocol. Chosen because the UI-UX Constitution's "unread counts must be visible" (§17) requires live updates on the chat *list* screen, not only inside an open thread, which a per-user room satisfies with a single join; per-chat rooms would add subscribe/unsubscribe complexity for a requirement (typing indicators, presence) that doesn't exist in MVP scope, which the Final Rule (§30) rejects. A user with multiple devices/tabs simply has multiple sockets in the same room — broadcasts reach all of them with no extra fan-out code.
- **Event contract:** `message:new` (`{id, chatId, senderId, content, createdAt}`, same shape as the REST message payload) and `chat:read` (`{chatId, readByUserId, readAt}`), both broadcast unconditionally to both sides' `user:<id>` rooms (including the sender's own other devices — clients dedupe by `id`). Deliberately minimal: `message:new` doesn't carry a full chat summary, so a client that doesn't yet know a `chatId` (e.g. a post owner's first message from a brand-new participant) falls back to REST (`GET /chats`/`GET /chats/:chatId`) rather than the gateway duplicating `buildChatSummary()`'s query.
- **No message replay or reconnect state:** Socket.IO carries zero delivery guarantee. A client that missed events while disconnected catches up entirely through the already-existing cursor-paginated REST endpoints on reconnect. Deliberately not using Socket.IO's built-in connection-state-recovery feature — REST already solves this correctly, and the Technical Constitution's Architecture Restrictions (§4) prohibit Redis at MVP regardless.
- **Handshake authentication:** the existing `passport-jwt` `JwtStrategy` is HTTP/Express-coupled and doesn't apply to a socket handshake, so `ChatsGateway.handleConnection()` performs the same two steps directly (`JwtService.verifyAsync` + `UsersService.findById`), reading the token from Socket.IO's standard `handshake.auth.token` field. Any failure (missing/invalid/expired token, or a token for a since-deleted user) disconnects the socket.
- **`AuthModule`/`JwtModule` wiring fix:** `AuthModule` previously did not export `JwtModule`, so `JwtService` wasn't injectable outside it. Added `exports: [JwtModule]` to `AuthModule` so `ChatsGateway` reuses the already-configured singleton instead of a second, duplicated `JwtModule.register({...})` (backend rule: avoid duplicated code).
- No Redis, Kafka, RabbitMQ, or other pub-sub/broker infrastructure — the single in-memory Socket.IO instance is sufficient for, and the only option consistent with, the single-process modular monolith (Technical Constitution §2, §4).

### Deferred, explicitly out-of-scope items identified during the Phase 10 architecture audit

These three items were surfaced while designing Chat/the realtime layer but are **not** Chat-specific bugs — they're pre-existing or cross-cutting gaps, deliberately not fixed here. Recorded so they aren't silently lost.

- **CORS configuration** — `main.ts` has no CORS configuration today (neither REST nor Socket.IO). Not a defect: ADR-005 (Image Storage Architecture) already establishes the precedent that CORS is correctly deferred until "any web client" exists ("No CORS configuration is required (irrelevant to the planned React Native client, and not yet needed for any web client)"). The first and only currently-roadmapped browser-origin client is **Phase 13 - Admin Panel** — CORS should be configured there (`app.enableCors()` and/or the Socket.IO gateway's `cors` option), with final allowed-origins lockdown per environment folded into **Phase 15 - Production**'s "Environment Configuration"/"Nginx" work. MVP-required by the time Admin Panel ships; not required, and correctly absent, before then.
- **User Blocking** — Technical Constitution §21 ("Users may block other users. Blocked users may not: start new chats, continue interactions") and MVP Scope Lock §5/§15 (`Block User`/`User Blocking`, both **Approved** — i.e. in-MVP-scope, not a future-version exclusion) require this, but there is no `Block` model and no ROADMAP phase for it yet in the current `docs/ROADMAP.md` (V3). Two other project documents already anticipate a phase for it under an older numbering scheme: `docs/07-development-constitution.md` §3's "Approved Sequence" places **Reports** between Notifications and Admin Panel (position 11 of 13), and `docs/09-implementation-roadmap.md`'s old Phase 12, "Reports & Safety," explicitly bundles `Report User` / `Report Post` / `Block User` / `Moderation Tools` together — consistent with `docs/01-project-constitution.md` §12 ("Trust & Safety") grouping the same items. **Proposed placement:** a new "Reports & Safety" phase in `docs/ROADMAP.md`, inserted after Notifications (Phase 12) and before Admin Panel (Phase 13), covering Report Post/Report User/User Blocking/Admin Moderation together — not inserted as part of this closeout, since only the Reservation-phase insertion was approved; recorded here as a proposal for a future documentation pass. When implemented, `Block` would likely follow the `Favorite` bridge-table pattern (composite key over the two user ids), and `ChatsService.sendFirstMessage()`/`sendMessage()` would need a small, additive block-check — not a redesign of anything Phase 10 already shipped.
- **`Message.type`** — `Message` has only `content`/`createdAt`/`senderId` today; every message is implicitly a plain user chat message. MVP Scope Lock §12 ("Chat") lists `Reservation Flow` inside Chat's own Included bullet list (alongside Realtime Messaging and Read Receipts), which is the one — admittedly loose — documented link suggesting reservation status changes might need to surface inside a chat thread (e.g. a "buyer selected" system entry), which a plain-text-only `Message` can't represent. **Proposed placement:** decide and, if needed, implement this as part of **Phase 11 - Reservation**'s own Step 0 design audit, not now — that audit should explicitly weigh a `Message.type` addition (`'text' | 'system'`, following the `PostStatus`-style enum precedent) against simply routing reservation events through the already-separate `Notification` entity instead (Database Constitution §13 already lists `Reservation` as a `Notification` type), since the latter may satisfy the product need without touching the just-shipped `Message` model at all. Not MVP-blocking for Phase 10; dependency is Phase 11's own Step 0, not Phase 10.
  - **Resolved by the Phase 11 Step 0 audit:** neither option was taken. `Post.status` (already-shipped REST field) is the authoritative signal, paired with a new `post:status-changed` Socket.IO event reusing the existing per-user-room `ChatsGateway` infrastructure. No `Message.type` column was added; no `Notification` entity was built. See "Reservation (Phase 11)" below.

## Reservation (Phase 11)

- **Architecture & Database Schema:**
  - Added `Post.reservedChatId` (`String? @unique`), foreign key to `Chat` with `onDelete: SetNull`.
  - Added `Post.reservedAt` (`DateTime?`) and `Post.completedAt` (`DateTime?`), mirroring the existing nullable `Post.deletedAt` pattern and supporting Project Constitution §21/§22 KPIs ("Reserved Posts" KPI, "First Reservation" milestone).
  - Added `Chat.reservedForPost` (`Post? @relation("ReservedChat")`) as the named Prisma relation back-reference.
  - Migration `20261008000000_add_post_reservation_fields` applied via `prisma migrate deploy`. Generated via a shadow-database diff (`kiwi_shadow_p11` from `template_postgis`), hand-trimming spurious `DROP INDEX` / `ALTER COLUMN location` statements caused by Prisma's generated PostGIS geography column (ADR-004).
  - **Single Unique FK Design:** No separate `Reservation` join model was created. A single `@unique` nullable foreign key on `Post` structurally enforces the Database Constitution §22 rule ("Only one reservation may exist per post") without table bloat. The selected buyer is always derived dynamically via `reservedChat.participantId`, eliminating redundant columns and sync-drift risks.
- **REST Endpoints & Request/Response Contracts:**
  - `POST /posts/:id/reservation` ("Select Buyer" & "Reserve Listing", implemented as one atomic action per Project Constitution §8 Rules 4/5):
    - Input: `SelectBuyerDto { chatId: string }`.
    - Authorization: Authenticated, post owner only (`403 Forbidden` if `user.id !== post.ownerId`).
    - Precondition: Post must be in `ACTIVE` status (`409 Conflict` otherwise, including already-`RESERVED` — "Only one reservation may exist per post").
    - Chat verification: The submitted `chatId` must exist and belong to this post (`chat.postId === post.id`), returning `404 Not Found` otherwise.
    - Effect: Atomically sets `reservedChatId = chat.id`, `reservedAt = now()`, `status = RESERVED`. Returns updated post detail (`postDetailSelect`, 201).
  - `POST /posts/:id/completion` ("Complete Listing"):
    - Input: No body required.
    - Authorization: Authenticated, post owner only (`403 Forbidden` if `user.id !== post.ownerId`).
    - Precondition: Post must currently be in `RESERVED` status (`409 Conflict` from `ACTIVE`, `COMPLETED`, or any other status).
    - Effect: Atomically sets `status = COMPLETED`, `completedAt = now()`. Returns updated post detail (`postDetailSelect`, 201).
- **State Machine & Lifecycle Transitions:**
  - Allowed transitions are strictly forward-only: `ACTIVE → RESERVED → COMPLETED`.
  - `ACTIVE → COMPLETED` directly is rejected with `409 Conflict`: Core User Journey (§6) mandates `Chat → Select Buyer → Phone visible → Deal`. A deal implies a prior completed reservation; skipping reservation is forbidden.
  - `COMPLETED` is terminal for MVP: no transition out of `COMPLETED` is allowed (`409 Conflict`).
- **Seller Phone-Number Visibility Rules:**
  - One-directional: only the selected buyer (`reservedChat.participantId`) gains visibility of the seller's phone number (`owner.phone`) once the post reaches `RESERVED` or `COMPLETED`.
  - Pure, state-based evaluation: `canViewSellerPhone()` in `src/posts/phone-visibility.util.ts` dynamically evaluates `isReservationActive && reservedChatParticipantId === viewerId` on every read. No static boolean flag is persisted.
  - Endpoints exposing the phone:
    - `GET /posts/:id`: uses `postDetailWithPhoneSelect`, which conditionally includes `owner.phone` for the authorized buyer and strips it for all other callers.
    - `GET /chats` and `GET /chats/:chatId`: `buildChatSummary()` in `ChatsService` conditionally includes `otherUser.phone` when the caller is the chat participant on a reserved/completed post.
  - Strict privacy gating: The seller never gains access to the buyer's phone number (reverse visibility is prohibited per Technical Constitution §19 and Project Constitution §8 Rule 6). Unauthenticated callers, other non-selected chat participants, and the owner viewing their own post never receive the phone field.
- **Socket.IO Realtime Layer (`post:status-changed`):**
  - Event contract: `post:status-changed` with payload `{ postId: string, status: PostStatus, reservedChatId: string | null }`.
  - Gateway method: `ChatsGateway.notifyPostStatusChanged()`, emitted to the `user:<userId>` rooms of both the post owner and the selected buyer.
  - Non-throwing, best-effort: failure to emit via Socket.IO is caught and logged, never failing the underlying REST mutation.
  - REST remains the sole source of truth and fallback: disconnected clients catch up via REST endpoints on reconnect.
  - Module wiring: `ChatsModule` exports `ChatsGateway`, which is imported by `PostsModule`.
- **COMPLETED-Post Chat Behavior Preserved:**
  - Upheld Phase 10 approved decision: Database Constitution §22 ("Completed post: read-only, no new chats") blocks only *new chat creation* (`POST /posts/:postId/messages` returns `409 Conflict` when no chat exists yet).
  - Existing chats remain fully writable (`POST /chats/:chatId/messages` succeeds) regardless of post status. `ChatsService.sendMessage()` was untouched.
- **Testing & Verification:**
  - Unit tests: 32 tests passing across 6 suites, including 8 tests in `src/posts/phone-visibility.util.spec.ts`.
  - E2E tests: 163 tests passing across 10 suites, including 27 tests in `test/reservation.e2e-spec.ts` (covering reservation, completion, state-machine rejections, authorization, phone gating, chat persistence) and 3 tests in `test/reservation-realtime.e2e-spec.ts` (Socket.IO push events).
  - Realtime test stability: resolved a client/server handshake-timing race in `chats-realtime.e2e-spec.ts` and `reservation-realtime.e2e-spec.ts` where a client's transport `connect` event could fire slightly before the server-side async `handleConnection` joined the room, adding a 150ms post-connect grace period and 10000ms wait timeout. Verified across multiple consecutive full test runs.
- **Explicitly Deferred / Out-of-Scope Future Work (Not Implemented):**
  - **Reverting `RESERVED` post back to `ACTIVE`:** Intentionally excluded from MVP. Once a post is reserved, the only valid forward action is `Complete Listing`.
  - **Buyer cancellation / release without completion:** Intentionally excluded from MVP.
  - **Selecting / replacing another buyer after `RESERVED`:** Intentionally excluded from MVP ("Only one reservation may exist per post"). Reselecting while `RESERVED` returns `409 Conflict`.
  - *Note on above items:* None of these are in MVP Scope Lock §13 (`Select Buyer, Reserve Listing, Reveal Phone Number, Complete Listing` only). Implementing them requires a dedicated future task/phase addressing cancellation semantics (clearing timestamps, whether reservation history is tracked, immediate revocation of phone visibility, and impact on other chats).
  - **`Message.type` ('text' | 'system'):** Evaluated during the Step 0 audit. Because reservation state is already fully authoritative via `Post.status` (REST) and broadcast via `post:status-changed` (Socket.IO), mutating the `Message` schema was unnecessary. Deferred indefinitely for MVP.
  - **`Notification` Entity:** Documented in Constitutions but scheduled for Phase 12. Not created prematurely in Phase 11.
  - **User Blocking (`Block` model):** Scheduled for future "Reports & Safety" phase.
  - **CORS configuration:** Scheduled for Phase 13 Admin Panel / Phase 15 Production.
