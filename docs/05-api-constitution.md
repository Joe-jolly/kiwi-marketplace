# Kiwi Marketplace

## API Constitution

Version: 1.0

Status: Approved

---

# 1. API Philosophy

The API is the contract between frontend and backend.

The API must be:

* Predictable
* Consistent
* Secure
* Versionable

Frontend developers should be able to predict API behavior without reading backend implementation.

---

# 2. API Architecture

Architecture Style:

REST API

Base URL Example:

/api/v1

All endpoints must be versioned.

Future versions:

/api/v2

/api/v3

Versioning is mandatory.

Rollout of the versioned base path to already-shipped endpoints is tracked in ROADMAP.md / BACKLOG.md; this rule is binding for all new and existing routes going forward.

---

# 3. HTTP Methods Constitution

GET

Read data.

POST

Create data.

PATCH

Update data.

DELETE

Soft delete actions.

Methods must be used consistently.

---

# 4. Endpoint Naming Constitution

Endpoints must use nouns.

Good:

/posts

/posts/:id

/categories

/chats

/messages

Bad:

/getPosts

/createPost

/deleteMessage

Verbs are prohibited in endpoint names.

---

# 5. Response Constitution

Every API response must follow a consistent structure.

**Amendment (Phase 8/9 hardening, current authoritative contract):** every endpoint shipped so far (Auth, Users, Posts) returns the resource or result directly, with no `{success, data}` envelope, and this document previously described an envelope that was never actually implemented anywhere in the codebase. Rather than retrofit a global response-wrapping interceptor onto every already-shipped, already-tested endpoint for no functional benefit (no consumer — the mobile app has not started per `ROADMAP.md`), this section is amended to document the contract Kiwi has consistently implemented since Phase 1, which is now the binding rule for all new and existing endpoints:

Success Response (single resource or mutation result):

{ ...resource fields directly, no wrapper... }

Cursor-paginated list endpoints (for example, the feed, `GET /posts/me`, and `GET /favorites`) use the following response contract, consistent with the cursor pagination model defined in ADR-004:

{
"items": [],
"nextCursor": "string | null",
"hasNextPage": true
}

Kiwi has no non-cursor-paginated list endpoint in current use; if one is introduced, it must still not return unbounded lists (API Constitution §9) and should default to the cursor shape above rather than inventing a `{success, data, pagination}` shape that has no precedent in the codebase.

Error Response (NestJS's standard exception-filter output — no custom exception filter is implemented):

{
"statusCode": 400,
"message": "Human readable error message, or an array of messages for validation failures",
"error": "Bad Request"
}

Consistency is mandatory.

---

# 6. Authentication Constitution

Authentication Type:

JWT

Access Token:

Used for API requests.

Refresh Token:

Used for session renewal.

Protected routes require valid access tokens.

---

# 7. Authorization Constitution

Authorization is enforced on the backend.

Frontend authorization exists only for UX.

Backend authorization always wins.

Example:

User A cannot modify User B's post.

Even if frontend validation fails.

---

# 8. Validation Constitution

All incoming data must be validated.

Validation occurs before business logic execution.

Invalid data must never reach services.

Examples:

* Empty title
* Invalid email
* Invalid phone number
* Invalid category id

Validation failures must return friendly errors.

---

# 9. Pagination Constitution

Pagination is mandatory.

Large lists must never return all records.

Pagination Type:

Cursor Pagination

Cursor fields are sort-mode-specific and opaque to the client. See ADR-004 (Geospatial Feed Architecture) for the authoritative cursor strategy per sort mode.

A cursor issued for one sort mode is invalid for any other sort mode and must be rejected if reused across a sort-mode change.

Reason:

Deterministic, duplicate-free, complete pagination for every sort mode.

---

# 10. Sorting Constitution

Supported sort types and the default sort are defined authoritatively in ADR-004 (Geospatial Feed Architecture). This Constitution does not restate them, to prevent the two documents from drifting out of sync.

Sorting logic belongs to the backend.

Sorting logic must never be duplicated in the frontend.

---

# 11. Filtering Constitution

Filtering must be performed on the backend.

Examples:

* Category
* Price Range
* Distance
* Status

Frontend filtering of large datasets is prohibited.

---

# 12. Search Constitution

Search execution belongs to the backend.

Search Sources:

* Title
* Description
* Category

Search must support:

* Partial Matching
* Case Insensitive Matching

---

# 13. Error Handling Constitution

Backend errors must never leak internal details.

Bad:

Prisma Error

Database Error

Stack Trace

Good:

"Post not found."

"Unauthorized."

"Validation failed."

Only safe messages may be returned.

---

# 14. HTTP Status Constitution

200

Success

201

Created

400

Bad Request

401

Unauthorized

403

Forbidden

404

Not Found

409

Conflict

500

Internal Server Error

Status codes must be used correctly.

---

# 15. Posts API Constitution

Supported Operations:

Create Post

Update Post

Delete Post

Get Post

Get Posts

Search Posts

Favorite Post

Unfavorite Post

Get Favorites

Upload Post Image

Posts are the primary business entity.

Favorite Post and Unfavorite Post are implemented as `POST /posts/:id/favorites` and `DELETE /posts/:id/favorites` — idempotent (§24). Get Favorites ("My Favorites") is `GET /favorites`, a separate, top-level, cursor-paginated (§9) list endpoint, since it is not scoped to a single post.

Upload Post Image requires authentication. The uploaded file is validated and compressed server-side before being stored in Cloudflare R2, per the Technical Constitution's File Upload Constitution and ADR-005 (Image Storage Architecture).

---

# 16. Categories API Constitution

Supported Operations:

Get Categories

Get Category Posts

Category creation belongs to Admin.

Regular users cannot manage categories.

---

# 17. Chat API Constitution

Supported Operations:

Create Chat

Get Chats

Get Chat

Get Messages

Send Message

Mark Chat Read

Realtime communication uses Socket.IO.

**Amendment (Phase 10 implementation, current authoritative contract):** the operations above are implemented as REST, with Socket.IO layered on top as a push-notification channel, not as an alternative write path:

* Create Chat / Send Message — `POST /posts/:postId/messages` (creates the chat lazily on the first message, or reuses an existing one) and `POST /chats/:chatId/messages` (send on a chat that already exists, either side). Chat creation is lazy (Chat Constitution, §18 of the Technical Constitution): no `Chat` row exists until the first message is actually sent.
* Get Chats — `GET /chats`, cursor-paginated (§9) like every other list endpoint, sorted by most-recently-active conversation first (`lastMessageAt desc, id desc`), not by chat-creation time.
* Get Chat — `GET /chats/:chatId`, single chat detail (not one of the operations originally named above, added because both the mobile app and the Socket.IO layer need a single-chat fetch — e.g. to resolve a `chatId` a client doesn't yet have full details for).
* Get Messages — `GET /chats/:chatId/messages`, cursor-paginated, newest-first (`createdAt desc, id desc`).
* Mark Chat Read — `POST /chats/:chatId/reads` (not one of the operations originally named above; required by the read-receipt design, §16 of the UI-UX Constitution — advances the caller's own read watermark).
* A chat that exists but the caller is not part of returns `403`, not `404` — chat ids are opaque, non-enumerable UUIDs, unlike e.g. a hidden post, so there is no existence-hiding benefit to a blanket 404 here.

Realtime contract (Socket.IO): every authenticated socket joins a single room, `user:<userId>`, on connect — there is no per-chat room and no client-emitted business event. The server pushes two events, both mirroring the REST response shapes above and delivered to both sides of the chat:

* `message:new` — `{ id, chatId, senderId, content, createdAt }`, emitted after a `POST .../messages` call has already committed.
* `chat:read` — `{ chatId, readByUserId, readAt }`, emitted after a `POST /chats/:chatId/reads` call has already committed.

REST remains the sole source of truth. Socket.IO carries no delivery guarantee and no message replay: a client that misses events while disconnected catches up entirely through the cursor-paginated REST endpoints above on reconnect, not through any Socket.IO-side backlog.

Business Rule:

One Post

*

One Participant

=

One Chat

Duplicate chats are prohibited.

A COMPLETED post accepts no *new* chats (Reservation Constitution, §22 of the Database Constitution) — `POST /posts/:postId/messages` returns `409` when no chat yet exists for that post/participant pair and the post is COMPLETED. An already-existing chat is unaffected by the post's later status and keeps accepting messages via `POST /chats/:chatId/messages`.

---

# 18. Message API Constitution

MVP Supports:

Text Messages

Only

Future Features:

* Images
* Files
* Voice

Not part of MVP.

---

# 19. Notification API Constitution

Supported Operations:

Get Notifications

Mark As Read

Unread Count

Unread calculations belong to the backend.

---

# 20. Reports API Constitution

Supported Operations:

Report Post

Report User

Get My Reports

Human moderation reviews reports.

---

# 21. Admin API Constitution

Admin Routes:

/admin/*

Admin operations require:

Role = admin

Role validation must occur on the backend.

---

# 22. Rate Limiting Constitution

Sensitive endpoints should support rate limiting.

Examples:

* Login
* Register
* SMS Verification

Reason:

Protection against abuse.

---

# 23. SMS Verification Constitution

SMS verification is mandatory.

Supported Operations:

Send Verification Code

Verify Code

Registration completes only after successful verification.

---

# 24. Idempotency Constitution

Repeated requests should not create duplicate data.

Examples:

Favorites

Duplicate favorites must not be created.

Chats

Duplicate chats must not be created.

Idempotent behavior is preferred.

---

# 25. API Documentation Constitution

All APIs must be documented.

Documentation Tool:

Swagger

Swagger generation is mandatory.

The API documentation must always reflect the current implementation.

Rollout of Swagger documentation to already-shipped endpoints is tracked in BACKLOG.md; this rule is binding for all new endpoints going forward.

---

# 26. Logging Constitution

Important events should be logged.

Examples:

* Login
* Registration
* SMS Verification
* Reports
* Reservation Actions

Sensitive information must never be logged.

---

# 27. Security Constitution

The API must never trust the frontend.

Every request must be validated.

Every protected action must be authorized.

Every user action must be verified on the backend.

---

# 28. Future Compatibility Constitution

API changes must avoid breaking existing clients.

Breaking changes require a new API version.

Examples:

/api/v2

/api/v3

---

# 29. Performance Constitution

Avoid unnecessary queries.

Avoid N+1 problems.

Pagination is mandatory.

Indexes must support frequently used endpoints.

---

# 30. Final Rule

API consistency is more important than developer convenience.

When in doubt:

Choose the option that keeps the API predictable and uniform.
