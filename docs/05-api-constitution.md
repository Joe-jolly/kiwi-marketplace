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

Success Response:

{
"success": true,
"data": {}
}

List Response:

{
"success": true,
"data": [],
"pagination": {}
}

Error Response:

{
"success": false,
"message": "Human readable error message"
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

Primary Cursor:

created_at

Secondary Cursor:

id

Reason:

Stable performance.

---

# 10. Sorting Constitution

Supported Sort Types:

nearest

newest

oldest

Default:

nearest

↓

newest

Sorting logic belongs to the backend.

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
* JSONB Details

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

Posts are the primary business entity.

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

Get Messages

Send Message

Realtime communication uses Socket.IO.

Business Rule:

One Post

*

One Participant

=

One Chat

Duplicate chats are prohibited.

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
