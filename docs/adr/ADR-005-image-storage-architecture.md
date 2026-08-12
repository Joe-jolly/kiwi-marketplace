# ADR-005: Image Storage Architecture

## Status

Accepted (amended)

## Date

2026-08-09

## Amendments

- 2026-08-12 — Clarified that ownership verification is exclusively a namespace-prefix check, with no R2 existence lookup, resolving a contradiction between this ADR's Design Decisions and `image-storage-v1-spec.md`'s Error Handling table discovered during Phase 7 Step 5 e2e verification. See "Amendment: Ownership Verification Scope" below. Design Decisions gains a new row; Future Considerations gains a new escape hatch.

---

## Context

Kiwi Marketplace listings require photos: the Technical Constitution (§17, File Upload Constitution) mandates Cloudflare R2 as the storage backend, required compression, WebP as the stored format, a maximum of 15 images per post, and that original (uncompressed) files are never retained — only compressed files are stored. The Database Constitution (§9, Post Images Entity) additionally requires supported image ordering and that only image *metadata*, never image bytes, lives in PostgreSQL.

The current implementation satisfies none of the storage-backend requirements: `CreatePostDto`/`UpdatePostDto` accept `imageUrls: string[]`, validated only with `@IsUrl()`, capped at 10 (not 15). A client may supply any reachable URL — there is no upload pipeline, no compression, no format enforcement, and no verification that Kiwi's backend has any control over, or even access to, the referenced bytes. This is a placeholder, tracked as open work in `BACKLOG.md` ("Replace image URLs with Cloudflare R2 upload flow") and `ROADMAP.md` Phase 7 (Image Storage).

No prior ADR governs image storage. ADR-001 (Feature-Based Architecture) governs where the implementation must live; ADR-004 (Geospatial Feed Architecture) is referenced only as structural and stylistic precedent for how this ADR is written and how a future implementation-grade specification should extend it — it has no direct technical bearing on image storage.

---

## Problem Statement

Kiwi's image storage architecture must guarantee, simultaneously:

- Every stored image is a real, R2-hosted, WebP-compressed file — never an arbitrary client-supplied URL and never an uncompressed original.
- The backend independently verifies uploaded content (real file bytes, not a client-declared `Content-Type` header) before anything is persisted or attached to a post, consistent with the API Constitution's "never trust the frontend" principle.
- Image ownership is enforced server-side: a user can never attach another user's uploaded image to their own post.
- Removing an image from a post's edit actually frees the corresponding R2 object — orphaned storage is not an accepted outcome.
- The solution remains simple, single-developer-operable, and introduces no infrastructure beyond what the Technical Constitution already permits (no new queues, workers, or prohibited technologies).

---

## Decision

Kiwi uploads listing images through the API server. The client sends the original image file to a new authenticated endpoint; the API validates it, compresses and converts it to WebP in memory, writes only the compressed result to Cloudflare R2 via its S3-compatible API, and stores the resulting object key — never a raw URL and never the original file — in PostgreSQL.

### Upload Flow

- The client uploads the original image as `multipart/form-data` to a JWT-authenticated endpoint on `PostsController`.
- The API verifies the real file type via content sniffing (not the client-declared `Content-Type` header), rejects unsupported types and oversized files before any further processing.
- The API compresses and converts the validated image to WebP in memory (via `sharp`), and writes only that compressed buffer to R2 using the S3-compatible `PutObjectCommand`. The original buffer is never written to R2 or to disk, and is discarded once the request completes.
- The API returns the resulting object key to the client. The client collects one key per uploaded image and submits the full ordered key array as part of `POST /posts` or `PATCH /posts/:id`.
- `PostsService` independently re-verifies, at create/update time, that every submitted key belongs to the authenticated user (via a per-user key namespace, see Storage below) before attaching it to a post.

### Storage

- Object keys are namespaced by uploader: `posts/{userId}/{uuid}.webp`. This namespace is what allows `PostsService` to verify ownership of a key without a separate lookup table.
- `PostImage.imageUrl` stores the R2 object key, not a fully-resolved URL. The public URL is derived at read time from a single configured public base URL (`R2_PUBLIC_BASE_URL`) plus the stored key. No schema or column-type change is required: the column's type is unchanged; only the meaning of its content changes, from "arbitrary external URL" to "Kiwi-controlled R2 object key."
- No image bytes are ever stored in PostgreSQL, satisfying the Database Constitution's metadata-only requirement.

### Ordering and Mutation

- `PostImage.displayOrder` continues to define image order, unchanged.
- `POST /posts` and `PATCH /posts/:id` continue to accept an ordered array (of keys, not URLs) and continue to fully replace a post's image set on update, exactly as today — no partial add/remove/reorder endpoint is introduced.
- On update, `PostsService` diffs the previous key set against the newly submitted one and issues an R2 delete for every key that is no longer present, in addition to the existing PostgreSQL row replacement. This is required now that Kiwi owns the underlying objects — leaving them in R2 after a post no longer references them would be an unbounded storage leak.

### Module Placement

- A new shared infrastructure module, `StorageModule`/`StorageService` (under `backend-api/src/storage/`), wraps the R2 S3 client and the compression step, exposing `upload`, `delete`, and `getPublicUrl`. It sits outside feature folders, parallel to the existing `PrismaModule`/`PrismaService`, per ADR-001's rule that infrastructure components remain outside feature folders.
- `PostsModule`/`PostsService` depends on `StorageService` via dependency injection, exactly as it already depends on `PrismaService`. No separate "Images" feature module is introduced: images are not an independent business entity with their own lifecycle in the Constitutions (Database Constitution §6: one post has many images, entirely post-scoped), so ownership checks, the 15-image cap, and orchestration remain inside `PostsService`.

### Validation

- Allowed types: `image/jpeg`, `image/png`, `image/webp`, verified by content sniffing, not by the client-declared header.
- A maximum original-file size cap is enforced before compression runs.
- The upload endpoint requires authentication (`JwtAuthGuard`); anonymous uploads are rejected.
- `CreatePostDto`/`UpdatePostDto` are corrected to allow up to 15 images (matching the Technical and Database Constitutions), replacing the current, incorrect cap of 10.

---

## Architecture Principles

- **The backend never trusts client-declared file metadata.** Type and size are independently verified server-side before anything is persisted, per the API Constitution's security principles.
- **Compression is a guaranteed pipeline step, not a client courtesy.** Because the API mediates every upload, WebP conversion always happens, for every image, with no code path that can bypass it.
- **Storage ownership is structural, not just enforced by convention.** Per-user key namespacing makes ownership verification a simple prefix check rather than a separate authorization table.
- **Infrastructure stays outside feature folders; domain orchestration stays inside them.** `StorageService` is a dumb, reusable R2/compression wrapper; `PostsService` owns every image-related business rule (ownership, the 15-image cap, diff-and-delete on update).
- **No new infrastructure beyond what is already permitted.** `sharp` and an S3-compatible client are plain npm dependencies; no queue, worker, or prohibited technology (Technical Constitution §4) is introduced.

---

## Design Decisions

| Decision | Rationale |
|---|---|
| Direct server-side upload, not presigned-URL upload | Presigned URLs let the client write directly to R2, bypassing any server-side compression/format enforcement entirely — the API's only lever over a presigned upload is a `Content-Type` string in the signature, which does not verify actual bytes and carries no size constraint. Direct upload is the only option where WebP compression is structurally guaranteed. |
| Not a hybrid (presign raw upload, then server-side recompress) | Preserves server-side compression but at the cost of two R2 round trips, a scratch/quarantine prefix, and cleanup logic for abandoned or failed recompression passes — real, measurable complexity added to solve a bandwidth problem that has not been demonstrated to exist, contradicting the Performance Constitution ("measure before optimizing") and the Final Rule against complexity without measurable business value. |
| Store the R2 object key, not a resolved URL, in `PostImage.imageUrl` | Decouples the database from R2's public-domain/CDN configuration; a future change to the public base URL requires no data backfill. Matches Cloudflare's own recommended pattern for S3-compatible clients. |
| Per-user key namespace (`posts/{userId}/{uuid}.webp`) | Makes ownership verification a simple, self-contained prefix check inside `PostsService`, with no additional table or join required. |
| Keep whole-array replacement on update (no reorder/add/remove endpoints) | Matches the existing, already-familiar contract shape; avoids introducing new endpoints for a capability (partial image editing) with no demonstrated product requirement yet. |
| Diff-and-delete R2 objects on update | Without it, every image removed from a listing during an edit becomes a permanently orphaned R2 object with no code path that ever reclaims it. |
| New shared `StorageModule`, not a new "Images" feature module | Per ADR-001: infrastructure (R2 client, compression) stays outside feature folders; images have no independent business lifecycle apart from posts, so domain logic stays inside `PostsModule`. |
| `PostImage.id`/`updatedAt` gap left unresolved | Adding a surrogate key and an `updatedAt` column that would never meaningfully change (every "update" is a delete-and-recreate) buys nothing today; deferred until a feature actually needs per-image mutation, per the Final Rule against complexity without measurable value. |
| No R2 existence check on submitted keys (ownership is namespace-prefix only) | Adding a `HeadObjectCommand` verification per key would add up to 15 sequential R2 round-trips to every create/update, plus a new R2-availability dependency for a request path that is otherwise fully in-process — and would contradict this ADR's own stated benefit that ownership verification "requires no additional table" (Consequences). The only outcome an existence check would prevent is a user attaching a fabricated, never-uploaded key under their *own* namespace, producing a broken image in their *own* post — self-limited, not a cross-user or security concern, since the prefix check already fully blocks attaching another user's key. Deferred per the Performance Constitution ("measure before optimizing"); see Future Considerations for the escape hatch. |

---

## Business Rules

These rules govern image storage and hold regardless of implementation detail:

1. Every image attached to a post must be a WebP file stored in Cloudflare R2. No other storage location or format is permitted.
2. A post may have at most 15 images.
3. Image ordering is always explicit and preserved (`displayOrder`), never inferred from upload order or array position after storage.
4. Original (pre-compression) image bytes are never persisted to R2, to disk, or to PostgreSQL — only the compressed WebP result is stored.
5. Only image metadata (object key, display order, timestamps) is stored in PostgreSQL; image bytes never are.
6. An image may only be attached to a post by the user who uploaded it. Ownership is verified server-side at attach time, independent of anything the client asserts.
7. Replacing a post's image set (via `PATCH /posts/:id`) must delete the corresponding R2 objects for every image no longer referenced. No mutation path may leave an orphaned R2 object with no referencing `PostImage` row.
8. File type and size are verified server-side, from actual file content, before any image is accepted — never from client-declared metadata alone.
9. Uploading an image requires authentication. Anonymous or unauthenticated upload requests are rejected.

---

## Consequences

### Benefits

- Compression and format enforcement are guaranteed by construction — there is no code path that stores an image without them.
- Ownership verification requires no additional table: the key namespace itself encodes the uploader.
- No CORS configuration is required (irrelevant to the planned React Native client, and not yet needed for any web client).
- No orphaned-upload reconciliation problem exists: an upload either fully completes as part of a request the API server itself handled, or it never happened.
- Minimal schema footprint: no migration is required to adopt this decision; the existing `PostImage.imageUrl` column is reused unchanged in type.

### Trade-offs

- Image bytes transit the API server, consuming its bandwidth and CPU (for compression) rather than a direct client-to-R2 path. Accepted per the Performance Constitution ("measure before optimizing") until a real bottleneck is measured.
- Replacing `imageUrls: string[]` with an object-key array is a breaking change to the `POST /posts` / `PATCH /posts/:id` request shape. Accepted as pre-launch API evolution: no versioned base path (`/api/v1`) exists anywhere in the codebase yet, and no client (the mobile app, per `ROADMAP.md` Phase 12, has not started) currently consumes the old contract in production. The existing Postman collection (`api/Kiwi Marketplace API/Posts/`) is the only current consumer of the old shape and must be updated alongside the implementation.
- `PostImage`'s pre-existing deviation from the Technical Constitution's universal table-shape rule (no standalone `id`, no `updatedAt`) is knowingly left unresolved by this decision (see Design Decisions).

---

## Future Considerations

- Presigned-URL upload (with a mandatory client-side pre-compression step, or a server-side recompression pass after a presigned raw upload) remains the documented escape hatch if API-mediated upload is ever measured as a genuine bandwidth or scaling bottleneck.
- Per-key R2 existence verification (a `HeadObjectCommand` before attach) remains the documented escape hatch if self-inflicted broken-image reports from fabricated, never-uploaded keys are ever observed in practice — see Design Decisions, "No R2 existence check on submitted keys."
- `PostImage.id`/`updatedAt` may be added if a future feature requires true per-image mutation (for example, reordering without delete-and-recreate).
- A dedicated single-image delete or reorder endpoint may be introduced if product requirements move beyond whole-array replacement.
- The repository-wide `/api/v1` versioning rollout (Technical/API Constitution) is pre-existing, tracked separately, and is not a Phase 7 blocker.

---

## Amendment: Ownership Verification Scope

### Context

Phase 7 Step 5 (e2e verification) discovered a contradiction between two parts of the frozen contract: this ADR's Design Decisions table and `image-storage-v1-spec.md`'s Ownership Rule #3 both describe ownership verification as a pure `posts/{userId}/` namespace-prefix check with no R2 lookup — yet `image-storage-v1-spec.md`'s Error Handling table separately stated that a syntactically valid but never-uploaded key must be rejected with `400 Bad Request`, "same handling path as an ownership failure." The Step 4 implementation (`PostsService.assertImageKeysOwnedBy`) implements the prefix-only check described by the Design Decisions and Ownership Rules — it does not, and structurally cannot, reject a never-uploaded key that happens to carry a correct prefix. A dedicated Step 5 e2e test confirmed this empirically: such a key is accepted (`201`), not rejected.

This amendment was made via a Phase 7 Step 6 decision gate, after evaluating three options: (A) add a `HeadObjectCommand` existence check per submitted key, (B) amend the specification's Error Handling row to match the already-implemented, already-frozen pure-prefix model, (C) accept the discrepancy as an undocumented limitation without correcting the frozen text.

### Decision

Kiwi resolves the contradiction in favor of the already-implemented and already-designed pure-prefix model (Option B). `image-storage-v1-spec.md`'s Error Handling table is corrected to state that a syntactically valid, correctly-namespaced, never-uploaded key is **accepted**, not rejected — consistent with Ownership Rule #3 and this ADR's Design Decisions and Consequences. No production code changes result from this amendment; the Step 4 implementation already matches the corrected contract.

### Rejected alternatives

- **Add a `HeadObjectCommand` existence check (Option A)** — rejected for now: it would add up to 15 sequential R2 round-trips to every create/update, introduce a new R2-availability dependency into an otherwise fully in-process request path, and contradict this ADR's own stated benefit that ownership verification "requires no additional table" (Consequences). It also protects only against a self-limited edge case — a user attaching their own fabricated, never-uploaded key produces a broken image in their own post, not a cross-user security issue, since the prefix check already fully blocks attaching another user's key. Recorded as a documented future escape hatch (see Future Considerations), not implemented without a demonstrated need, per the Performance Constitution ("measure before optimizing").
- **Accept without correcting the frozen text (Option C)** — rejected because it would leave the frozen specification internally self-contradictory for any future reader, rather than resolving the discrepancy this amendment exists to close.

### Consequences of this amendment

- `image-storage-v1-spec.md`'s Error Handling table's "nonexistent key" row is corrected to describe actual, tested behavior.
- No schema, DTO, service, or controller change results — this is a documentation-only correction.
- The gap this amendment declines to close (a user producing a broken image in their own post via a fabricated key) remains theoretically possible and is now explicitly documented as an accepted, self-limited trade-off rather than a silent inconsistency.

---

## Related ADRs

- ADR-001: Feature-Based Architecture
- ADR-004: Geospatial Feed Architecture (structural/stylistic precedent only — no technical dependency)

See `docs/specifications/image-storage-v1-spec.md` for the full implementation-grade contract (endpoint definition, request/response format, DTO contract, validation, ownership, ordering, and error handling).
