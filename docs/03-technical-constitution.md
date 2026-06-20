# Kiwi Marketplace

## Technical Constitution

Version: 1.0

Status: Approved

---

# 1. Technical Philosophy

The system must prioritize:

* Simplicity
* Maintainability
* Scalability
* Reliability

Preferred Principle:

Simple > Complex

Working > Perfect

Maintainable > Clever

The system should be understandable by a new developer within a short period of time.

---

# 2. Architecture Style

Architecture Type:

Modular Monolith

The application consists of:

* Single Backend Application
* Single Database
* Multiple Independent Modules

Examples:

* Auth Module
* Users Module
* Categories Module
* Posts Module
* Favorites Module
* Chats Module
* Notifications Module
* Reports Module
* Admin Module

---

# 3. Technology Stack

Frontend Mobile:

* React Native
* TypeScript
* Redux Toolkit
* RTK Query

Backend:

* NestJS
* TypeScript
* Prisma ORM

Database:

* PostgreSQL

Realtime:

* Socket.IO

Storage:

* Cloudflare R2

Infrastructure:

* Docker
* Docker Compose
* Nginx

Version Control:

* Git
* GitHub

---

# 4. Architecture Restrictions

The following technologies are prohibited during MVP:

* Microservices
* Kafka
* Elasticsearch
* Kubernetes
* GraphQL
* Redis
* RabbitMQ

These technologies may only be introduced after proven business need.

---

# 5. Database Constitution

PostgreSQL is the single source of truth.

The following are not considered permanent data sources:

* Redux Store
* Local Storage
* RTK Query Cache
* Device Memory

All critical business data must exist in PostgreSQL.

---

# 6. Database Design Rules

Every table must contain:

* id
* created_at
* updated_at

Entities supporting soft deletion must include:

* deleted_at

Soft Delete is preferred.

Hard Delete is prohibited unless explicitly approved.

---

# 7. ORM Constitution

ORM:

Prisma

Prisma is mandatory.

TypeORM is prohibited.

Raw SQL may be used only when Prisma cannot efficiently solve the problem.

---

# 8. API Constitution

Architecture:

REST API

Methods:

GET

Read Data

POST

Create Data

PATCH

Update Data

DELETE

Soft Delete Actions

The frontend must never communicate directly with the database.

All communication must occur through APIs.

---

# 9. Authentication Constitution

Authentication Method:

JWT

Architecture:

Access Token

Stored in Memory

Refresh Token

Stored Securely

Refresh Token Rotation is required.

Passwords must never be stored in plaintext.

Password hashing:

bcrypt

---

# 10. Identity Constitution

User registration requires:

* Email
* Password
* SMS Verification

SMS verification is mandatory.

Reason:

* Reduce fake accounts
* Reduce spam
* Increase marketplace trust

---

# 11. Authorization Constitution

Authorization Type:

Role-Based Access Control

Roles:

* user
* admin

Frontend authorization exists for UX.

Backend authorization exists for security.

Backend authorization is always authoritative.

---

# 12. Guest User Constitution

Guests may:

* Browse Posts
* Search Posts
* View Categories
* View Post Details

Guests may not:

* Create Posts
* Chat
* Save Favorites
* Report Users
* Report Posts
* Access Notifications

Authentication is required for interaction.

---

# 13. Internationalization Constitution

Supported Languages:

* Uzbek
* Russian
* Korean
* English

Internationalization is mandatory from day one.

Hardcoded UI text is prohibited.

All text must use translation keys.

---

# 14. Currency Constitution

Supported Currency:

KRW

Only KRW is supported in MVP.

Currency conversion is a future feature.

---

# 15. Location Constitution

Location Strategy:

GPS First

Manual Override Allowed

Location belongs to the user.

Users must always have control over their location settings.

---

# 16. Search Constitution

Default Sort Order:

Nearest

↓

Newest

Search Sources:

* Title
* Description
* Category
* JSONB Details

Search logic belongs to the backend.

Search logic must never be duplicated in the frontend.

---

# 17. File Upload Constitution

File Storage:

Cloudflare R2

Supported Format:

Images

Compression:

Required

Image Format:

WebP

Maximum Images Per Post:

15

Original files should not be stored.

Compressed files should be stored.

---

# 18. Chat Constitution

Realtime Technology:

Socket.IO

Chat Creation Rule:

A chat is created only after the first message is sent.

Business Rule:

One Post

*

One Participant

=

One Chat

Duplicate chats are prohibited.

---

# 19. Marketplace Reservation Constitution

Seller may select only one buyer.

When selected:

* Post becomes Reserved
* Selected user gains phone visibility

Only one reservation may exist per post.

---

# 20. Notification Constitution

Notification Types:

* Messages
* Reservation Events
* System Events

Unread counters must be calculated on the backend.

Push notifications must be used sparingly.

Notification spam is prohibited.

---

# 21. User Safety Constitution

Users may block other users.

Blocked users may not:

* Start new chats
* Continue interactions

User safety takes priority over engagement metrics.

---

# 22. Account Constitution

Users may deactivate accounts.

Deactivated accounts:

* Cannot login
* Have hidden posts
* Retain historical data

Account deletion is not part of MVP.

---

# 23. Error Handling Constitution

Raw backend errors must never be shown to users.

All errors must be converted into user-friendly messages.

Every screen must support:

* Loading State
* Success State
* Empty State
* Error State

---

# 24. Offline Constitution

Application must support graceful offline behavior.

Requirements:

* Offline Banner
* Cached Content Display
* Friendly Offline Messaging

Users should never face a blank screen due to connectivity issues.

---

# 25. Frontend Constitution

Architecture:

Feature-Based Architecture

Examples:

* features/auth
* features/posts
* features/chats
* features/profile

Business logic should not live inside screens.

Business logic belongs to:

* Services
* Hooks
* RTK Query

---

# 26. UI Constitution

Design Principles:

* Content First
* Marketplace First
* Fast Navigation
* Minimal Friction

Inspired By:

Karrot Market

Animations should never reduce usability.

---

# 27. Infrastructure Constitution

Deployment Stack:

* Docker
* Docker Compose
* Nginx
* HTTPS

The system must remain deployable by a single developer.

Operational simplicity is preferred.

---

# 28. Performance Constitution

Measure before optimizing.

Premature optimization is prohibited.

New infrastructure complexity requires measurable business justification.

---

# 29. Technical Decision Priority

When technical conflicts occur:

Priority Order:

1. Project Constitution
2. Technical Constitution
3. Development Constitution
4. Cursor Operating Manual
5. Individual Feature Requests

The Constitution always wins.

---

# 30. Final Rule

Any technical decision that increases complexity without providing measurable business value must be rejected.
