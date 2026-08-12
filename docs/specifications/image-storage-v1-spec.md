# Image Storage V1 Specification

## Status

Approved and fully implemented (Phase 7, Steps 3–5). The Error Handling table's "nonexistent key" row was corrected in Step 6 to match the already-implemented, pure-namespace-prefix ownership model — see ADR-005's "Amendment: Ownership Verification Scope" for the full context and rejected alternatives. No other part of this contract changed from its original frozen form.

---

# Overview

This specification defines the complete, implementation-grade behavior of Kiwi's image storage pipeline, approved in `docs/adr/ADR-005-image-storage-architecture.md`.

ADR-005 defines **why** the direct-server-side-upload architecture was chosen and the architectural pattern it follows. This specification defines **exactly how it must behave**, in enough detail to implement and verify against, mirroring the level of detail `docs/specifications/search-ranking-v1-spec.md` established for `RELEVANCE`.

This specification replaces the current placeholder image contract (`imageUrls: string[]`, arbitrary client-supplied URLs, validated only by `@IsUrl()`) on `CreatePostDto` and `UpdatePostDto`. It does not change any other field, behavior, or response shape of `POST /posts`, `PATCH /posts/:id`, `GET /posts`, or `GET /posts/:id` beyond the image-related fields described here.

---

# Scope

In scope:

- The new image upload endpoint: request format, validation, response format.
- The corrected image field contract on `CreatePostDto`/`UpdatePostDto`.
- Server-side validation, compression, and storage rules.
- Ownership verification rules for uploaded images.
- Image ordering rules.
- Error handling for every validation and ownership failure case.

Out of scope (explicitly deferred, not part of this contract):

- `StorageModule`/`StorageService` internal implementation details (R2 client configuration, exact `sharp` invocation) — engineering decisions made at implementation time, constrained only by the rules below.
- Any partial image mutation endpoint (single-image delete, reorder) — not introduced by this contract; whole-array replacement on update is retained (see Ordering Rules).
- Any change to `title`, `price`, `description`, `details`, `categoryId`, `latitude`/`longitude` validation or behavior.
- Any change to the feed (`GET /posts`) or detail (`GET /posts/:id`) response shape beyond the `images` array's element content (see Response Format for `GET`).
- `/api/v1` versioning rollout — pre-existing, repository-wide, tracked separately per ADR-005's Consequences.

---

# Endpoint Definition

## Upload Image

```
POST /posts/images
```

- **Authentication**: required (`JwtAuthGuard`). Unauthenticated requests are rejected.
- **Purpose**: uploads a single original image, validates and compresses it server-side to WebP, stores it in Cloudflare R2, and returns the resulting object key. Does not attach the image to any post — attachment happens when the returned key is included in a subsequent `POST /posts` or `PATCH /posts/:id` request.
- **Cardinality**: one file per request. A post with multiple images requires multiple calls to this endpoint before the create/update request that references their keys.

No other new endpoint is introduced by this specification. `DELETE`/reorder of individual images is explicitly out of scope (see Scope).

---

# Request Format

## `POST /posts/images`

- Content type: `multipart/form-data`.
- Field name: `image` (single file field).
- No other fields are accepted on this request.

## `POST /posts` / `PATCH /posts/:id` (delta from current contract)

The `imageUrls: string[]` field is replaced by `imageKeys: string[]`:

| Field | Type | Required (Create) | Required (Update) | Constraints |
|---|---|---|---|---|
| `imageKeys` | `string[]` | Yes | No (whole-array replacement when present, unchanged when omitted) | 1–15 elements; each element must be a non-empty string previously returned by `POST /posts/images` and owned by the requesting user |

No other field on `CreatePostDto`/`UpdatePostDto` changes as a result of this specification.

---

# Response Format

## `POST /posts/images`

Success (`201 Created`):

```json
{
  "key": "posts/<userId>/<uuid>.webp"
}
```

- `key` is the R2 object key the client must include (verbatim) in `imageKeys` on a subsequent create/update request.
- No URL, signed or otherwise, is returned by this endpoint. Resolving a key to a displayable URL happens only on read (see below).

## `GET /posts` / `GET /posts/:id` (delta from current contract)

The `images` array element shape is unchanged at the field-name level:

```json
{
  "imageUrl": "string",
  "displayOrder": 0
}
```

- `imageUrl` is now a fully-resolved public URL, derived server-side from the stored object key plus the configured public base URL, at response-serialization time — not the raw key. Clients continue to receive a directly usable image URL exactly as they do today; only the storage-layer mechanism producing that URL has changed.
- No new field is added to `images` elements. No field is renamed. This preserves full response-shape compatibility for `GET` endpoints — the breaking change described in ADR-005's Consequences is confined to the create/update *request* shape (`imageUrls` → `imageKeys`), not to any response.

## `POST /posts` / `PATCH /posts/:id` (response)

Unchanged: both continue to return the created/updated post via `postDetailSelect`, whose `images` elements follow the `GET` shape above.

---

# DTO Contract

`CreatePostDto`:

```typescript
@IsArray()
@ArrayMinSize(1)
@ArrayMaxSize(15)
@IsString({ each: true })
@IsNotEmpty({ each: true })
imageKeys: string[];
```

`UpdatePostDto`:

```typescript
@IsArray()
@ArrayMinSize(1)
@ArrayMaxSize(15)
@IsString({ each: true })
@IsNotEmpty({ each: true })
@IsOptional()
imageKeys?: string[];
```

- The maximum array size is corrected from the current, incorrect `10` to `15`, matching Technical Constitution §17 and Database Constitution §9.
- `@IsUrl()` is removed: elements are opaque object-key strings, not URLs, and are not validated as URLs.
- DTO-level validation (shape, count, non-empty strings) is necessary but not sufficient — ownership validation (below) happens in the service layer, since it requires a database/storage-layer lookup that DTO validation cannot perform.

---

# Validation Rules

## At upload time (`POST /posts/images`)

1. A file must be present on the `image` field. A request with no file is rejected with `400 Bad Request`.
2. The file's real content type — determined by content sniffing, never by the client-declared `Content-Type` header alone — must be one of `image/jpeg`, `image/png`, `image/webp`. Any other detected type is rejected with `400 Bad Request`.
3. The file must not exceed the configured maximum original-file size. Oversized files are rejected with `413 Payload Too Large`.
4. The requester must be authenticated. Unauthenticated requests are rejected with `401 Unauthorized`.

## At create/update time (`POST /posts`, `PATCH /posts/:id`)

5. `imageKeys` must contain between 1 and 15 elements (Create: required; Update: optional, but when present must still satisfy this bound).
6. Every element of `imageKeys` must be a non-empty string.
7. Every element of `imageKeys` must pass the Ownership Rules below. Any key that fails ownership verification causes the entire request to be rejected with `400 Bad Request` — partial acceptance of an `imageKeys` array is never valid.

No other validation rule on `CreatePostDto`/`UpdatePostDto` (title, price, description, details, latitude/longitude, categoryId) is affected by this specification.

---

# Ownership Rules

1. Every uploaded object's key is namespaced by the uploading user: `posts/{userId}/{uuid}.webp`, assigned by the server at upload time — the client never supplies or influences the key.
2. At create/update time, `PostsService` verifies that every key in `imageKeys` is namespaced under the requesting user's own id. A key namespaced under a different user's id fails validation for the entire request (see Validation Rule 7).
3. Ownership verification is independent of anything the client asserts about a key — it is derived solely from the key's own namespace prefix, matched against the authenticated user's id from the JWT.
4. A key may be reused across multiple posts by the same user (for example, if a create request fails validation for an unrelated reason and is retried) — an uploaded image is not "consumed" or invalidated by being referenced once. Re-attaching the same key to a different post owned by the same user is permitted.
5. Uploading an image does not, by itself, reserve storage capacity against any specific post, and does not count toward any post's 15-image limit until the key is actually submitted in `imageKeys` on a create/update request.

---

# Ordering Rules

1. `imageKeys`' array order is the authoritative display order: `PostImage.displayOrder` is assigned as the zero-based index of each key within the submitted array, exactly as `imageUrls`' array order is used today.
2. `PATCH /posts/:id` with `imageKeys` present performs a full replacement of the post's image set: previously stored images not present in the new array are removed (both the `PostImage` row and the corresponding R2 object — see Storage/Deletion Rule below); images are recreated in the submitted order.
3. `PATCH /posts/:id` without `imageKeys` leaves the post's existing images and their order entirely unchanged.
4. No partial reorder, single-image add, or single-image delete operation is introduced by this contract (see Scope).

---

# Storage / Deletion Rule

- When `PATCH /posts/:id` replaces a post's image set, every previously-stored key that does not appear in the new `imageKeys` array must have its underlying R2 object deleted, in addition to its `PostImage` row being removed. This is a hard requirement, not an optimization: without it, every image removed during an edit becomes a permanently orphaned R2 object with no code path that ever reclaims it (ADR-005, Business Rule 7).
- Deletion of the R2 object and removal of the `PostImage` row for the same key must not leave the system in a state where one succeeds and the other silently doesn't — the implementation step must define the exact ordering/transaction strategy, constrained only by this outcome guarantee.

---

# Error Handling

| Condition | Result |
|---|---|
| `POST /posts/images` with no file | `400 Bad Request` |
| `POST /posts/images` with unauthenticated request | `401 Unauthorized` |
| `POST /posts/images` with unsupported/undetected file type | `400 Bad Request` |
| `POST /posts/images` with file exceeding the size cap | `413 Payload Too Large` |
| `POST /posts` / `PATCH /posts/:id` with `imageKeys` outside 1–15 elements | `400 Bad Request` (DTO validation) |
| `POST /posts` / `PATCH /posts/:id` with a non-string or empty-string element in `imageKeys` | `400 Bad Request` (DTO validation) |
| `POST /posts` / `PATCH /posts/:id` with any key not owned by the requesting user (fails the namespace-prefix check) | `400 Bad Request` (service-layer ownership check); no partial post creation/update occurs |
| `POST /posts` / `PATCH /posts/:id` with a syntactically valid, correctly-namespaced key that was never actually uploaded (or was already deleted) | **Accepted** — ownership verification is a pure namespace-prefix check (Ownership Rule #3) with no R2 existence lookup, by design. Such a key attaches successfully and resolves to a `imageUrl` pointing at a nonexistent R2 object at read time. This is a self-limited data-integrity edge case, not a security gap: a user can only ever produce this outcome under their own key namespace, and can never do so under another user's. See ADR-005, Design Decisions, "No R2 existence check on submitted keys." |

All error responses continue to follow the API Constitution's Error Response shape (`{ "success": false, "message": "..." }` / the framework's standard `BadRequestException`/`UnauthorizedException`/`PayloadTooLargeException` payloads) — no new error envelope is introduced.

---

# Non-Goals

To prevent scope creep during implementation:

- No presigned-URL upload path (see ADR-005's rejected alternatives).
- No single-image delete or reorder endpoint.
- No change to the 15-image cap being anything other than a fixed constant (no per-category or per-user configurable limit).
- No image transformation beyond WebP compression (no thumbnails, no multiple resolutions/variants).
- No signed or expiring URLs for reading images — `imageUrl` in `GET` responses is a stable, permanently public URL for as long as the underlying object exists.

---

# Definition of Done (for implementation, previewed here for traceability)

Full acceptance criteria belong to the implementation step's execution plan, not this frozen contract. At a minimum, implementation must demonstrate, against this specification:

1. `POST /posts/images` rejects unauthenticated requests, missing files, unsupported/undetected file types, and oversized files with the exact status codes above.
2. A successfully uploaded file is compressed to WebP and stored in R2; the original bytes are never written to R2, disk, or PostgreSQL.
3. `POST /posts` / `PATCH /posts/:id` reject any `imageKeys` entry not owned by the requesting user, with no partial effect.
4. `PATCH /posts/:id` with `imageKeys` deletes the R2 objects for every removed key, leaving no orphaned objects.
5. `GET /posts` and `GET /posts/:id` return a fully-resolved, directly usable `imageUrl` for every image, with the `images` element shape unchanged from today.
6. `CreatePostDto`/`UpdatePostDto` enforce the corrected 1–15 element bound.

---

# Related Documents

- ADR-005: Image Storage Architecture
- `docs/03-technical-constitution.md` §17 (File Upload Constitution)
- `docs/04-database-constitution.md` §9 (Post Images Entity)
- `docs/05-api-constitution.md` §15 (Posts API Constitution — Upload Post Image)
- `docs/specifications/search-ranking-v1-spec.md` — structural precedent for this document's format
- `ROADMAP.md` Phase 7 (Image Storage)
- `BACKLOG.md` (Posts: "Replace image URLs with Cloudflare R2 upload flow")
