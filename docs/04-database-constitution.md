# Kiwi Marketplace

## Database Constitution

Version: 1.0

Status: Approved

---

# 1. Database Philosophy

The database is the single source of truth.

All business-critical data must exist in PostgreSQL.

Frontend caches, local storage, and device memory are temporary layers and must never be considered authoritative.

---

# 2. Database Engine

Database:

PostgreSQL

ORM:

Prisma

Database access must occur through Prisma.

Direct database access from the frontend is prohibited.

---

# 3. Core Entity Model

The marketplace is built around the following core entities:

* User
* Category
* Post
* PostImage
* Favorite
* Chat
* Message
* Notification
* Report
* RefreshToken

These entities form the foundation of the MVP.

---

# 4. User Entity

Purpose:

Represents a marketplace user.

Core Responsibilities:

* Authentication
* Authorization
* Ownership of posts
* Participation in chats
* Favorites management
* Reports management

Relationships:

User

↓

Posts

↓

Chats

↓

Favorites

↓

Reports

---

# 5. Category Entity

Purpose:

Defines marketplace categories.

Examples:

* Phones
* Cars
* Services
* Housing

Relationship:

One Category

↓

Many Posts

Rule:

A post must belong to exactly one category.

---

# 6. Post Entity

Purpose:

Represents a marketplace listing.

A post is the primary business object.

Relationship:

One User

↓

Many Posts

One Category

↓

Many Posts

One Post

↓

Many Chats

One Post

↓

Many Images

One Post

↓

Many Favorites

---

# 7. Post Status Constitution

Supported Statuses:

active

reserved

completed

paused

deleted

Definitions:

active

Visible and available.

reserved

Buyer selected.

completed

Deal completed.

paused

Temporarily hidden.

deleted

Soft deleted.

Hard delete is prohibited.

---

# 8. Dynamic Details Constitution

Category-specific data must be stored in JSONB.

Example:

Phone Category

* storage
* ram
* battery

Car Category

* mileage
* fuel_type
* transmission

Rule:

Dynamic category attributes belong in JSONB.

Core marketplace fields belong in database columns.

---

# 9. Post Images Entity

Purpose:

Stores post images.

Relationship:

One Post

↓

Many Images

Rules:

Maximum:

15 images per post.

Image ordering must be supported.

Images are stored in Cloudflare R2.

Only image metadata is stored in PostgreSQL.

---

# 10. Favorites Entity

Purpose:

Stores saved listings.

Relationship:

Many-to-Many

User ↔ Post

Implementation:

Bridge Table

Rule:

UNIQUE(user_id, post_id)

Duplicate favorites are prohibited.

---

# 11. Chat Entity

Purpose:

Represents a conversation between seller and buyer.

Relationship:

One Post

↓

Many Chats

One Chat

↓

Many Messages

Business Rule:

One Post

*

One Participant

=

One Chat

Constraint:

Duplicate chats are prohibited.

---

# 12. Message Entity

Purpose:

Stores chat messages.

MVP Supports:

Text Messages Only

Future:

Images

Files

Voice Messages

Not part of MVP.

Relationship:

One Chat

↓

Many Messages

---

# 13. Notification Entity

Purpose:

Stores user notifications.

Supported Types:

* Message
* Reservation
* System

Notifications belong to users.

Unread tracking is required.

---

# 14. Report Entity

Purpose:

Stores abuse reports.

Supported Targets:

* Post
* User

Report Types:

Report Post

Report User

Human moderation reviews reports.

---

# 15. Refresh Token Entity

Purpose:

Stores active refresh tokens.

Requirements:

* Token Hash
* User Relation
* Expiration
* Revocation Support

Refresh token rotation is required.

---

# 16. Location Constitution

Each Post must support location data.

Required Fields:

* latitude
* longitude

Optional:

* address
* district
* city

Location data supports:

* Nearby Feed
* Search Filters
* Distance Sorting

---

# 17. Search Constitution

Search Sources:

* Post Title
* Post Description
* Category Name
* JSONB Details

Search must be case-insensitive.

Partial matching must be supported.

---

# 18. Audit Fields Constitution

All major entities must contain:

* created_at
* updated_at

Soft-delete capable entities must contain:

* deleted_at

---

# 19. Soft Delete Constitution

Preferred Strategy:

Soft Delete

Reason:

* Data Recovery
* Moderation Support
* Auditability

Hard delete requires explicit approval.

---

# 20. Index Constitution

Required Indexes:

Posts

* user_id
* category_id
* status
* created_at

Chats

* post_id
* participant_id

Messages

* chat_id
* created_at

Favorites

* user_id
* post_id

Notifications

* user_id
* is_read

Indexes must be added before production launch.

---

# 21. Constraint Constitution

Favorites:

UNIQUE(user_id, post_id)

Chats:

UNIQUE(post_id, participant_id)

Users:

UNIQUE(email)

Categories:

UNIQUE(slug)

Constraint violations must be handled gracefully.

---

# 22. Reservation Constitution

Only one reservation may exist per post.

Reserved post:

* remains visible
* cannot accept new reservation

Completed post:

* read-only
* no new chats

---

# 23. Data Ownership Constitution

Users own:

* Posts
* Favorites
* Reports

Chats are shared between participants.

Notifications belong to the recipient.

---

# 24. Migration Constitution

Schema changes must occur through Prisma Migrations.

Direct production database modifications are prohibited.

Every schema change must be versioned.

---

# 25. Future Expansion Constitution

The schema must support future modules:

* Jobs Marketplace
* Services Marketplace
* Housing Marketplace

Future expansion must not require redesigning core entities.

---

# 26. Final Rule

Database simplicity and consistency take priority over premature optimization.

If a database design increases complexity without measurable business value, it must be rejected.
