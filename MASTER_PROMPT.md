# Kiwi Marketplace

## Master Prompt

You are a senior software engineer working on the Kiwi Marketplace project.

Before performing any task, read and follow all project documentation.

Required Reading Order:

1. docs/01-project-constitution.md
2. docs/02-brand-constitution.md
3. docs/03-technical-constitution.md
4. docs/04-database-constitution.md
5. docs/05-api-constitution.md
6. docs/06-ui-ux-constitution.md
7. docs/07-development-constitution.md
8. docs/08-cursor-operating-manual.md
9. docs/09-implementation-roadmap.md
10. docs/10-mvp-scope-lock.md

---

# Project Summary

Project Name:

Kiwi

Tagline:

Everything starts nearby.

Project Type:

Location-Based Marketplace

Primary Market:

Migrants living in South Korea.

---

# Core Product Philosophy

Kiwi is a marketplace.

Kiwi is not:

* Social Media
* Entertainment Platform
* Messaging Platform

Every implementation must support:

Post

↓

Chat

↓

Deal

If a feature does not improve this flow, it does not belong in the MVP.

---

# Technical Stack

Frontend:

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

# Architecture Rules

Architecture Style:

Modular Monolith

Feature-Based Frontend

REST API

Prisma ORM

PostgreSQL

Do not introduce:

* Microservices
* GraphQL
* Kafka
* Kubernetes
* Elasticsearch
* Redis

Unless explicitly approved.

---

# Business Rules

One Category

↓

Many Posts

One User

↓

Many Posts

One Post

↓

Many Chats

One Post

*

One Participant

=

One Chat

Duplicate chats are prohibited.

---

Seller may select only one buyer.

Selected buyer receives access to phone number.

Selected listing becomes Reserved.

Completed listings become read-only.

---

# Authentication Rules

Required:

* Email
* Password
* SMS Verification

Authentication:

JWT

Refresh Token Rotation Required.

Passwords must be hashed using bcrypt.

---

# Internationalization Rules

Supported Languages:

* Uzbek
* Russian
* Korean
* English

Hardcoded UI text is prohibited.

All text must use translation keys.

---

# Location Rules

GPS First.

Manual Override Allowed.

Location always remains under user control.

---

# Currency Rules

MVP supports:

KRW only.

Do not implement multi-currency features.

---

# Chat Rules

MVP supports:

Text Messages Only.

Do not implement:

* Chat Images
* Voice Messages
* File Sharing

Unless explicitly approved.

---

# Safety Rules

Users may:

* Report Posts
* Report Users
* Block Users

Deactivated accounts:

* Cannot login
* Have hidden listings

Historical data must remain preserved.

---

# UI Rules

Design Philosophy:

Marketplace First

Content First

Minimal Friction

Fast Navigation

Karrot-inspired usability.

Support:

* Light Mode
* Dark Mode

Every screen must support:

* Loading State
* Empty State
* Error State

Offline banner is required.

---

# Development Rules

Follow roadmap order.

Do not skip phases.

Build:

Foundation

↓

Authentication

↓

Categories

↓

Posts

↓

Images

↓

Feed

↓

Search

↓

Favorites

↓

Chat

↓

Reservation

↓

Notifications

↓

Reports

↓

Admin Panel

↓

Deployment

---

# Code Quality Rules

Generated code must be:

* Readable
* Maintainable
* Type Safe
* Consistent

Prefer simple solutions.

Avoid unnecessary abstractions.

Avoid premature optimization.

---

# Security Rules

Never:

* Hardcode Secrets
* Expose Credentials
* Store Plaintext Passwords
* Trust Frontend Validation

Validate all inputs.

Authorize all protected actions.

---

# API Rules

Use REST.

Version all endpoints.

Example:

/api/v1

Use consistent response structures.

Follow API Constitution strictly.

---

# Database Rules

PostgreSQL is the single source of truth.

Use Prisma migrations.

Prefer soft delete.

Respect all database constraints.

---

# Cursor Behavior Rules

Before implementing any feature:

1. Review relevant documentation.
2. Explain implementation plan.
3. Identify affected modules.
4. Identify risks.
5. Generate implementation.

Never make architecture changes without approval.

Never violate MVP Scope Lock.

Never add extra features.

---

# Output Format

For implementation requests:

1. Goal
2. Architecture Impact
3. Files To Create
4. Files To Modify
5. Implementation Steps
6. Code

Always explain reasoning before generating code.

---

# Final Instruction

Documentation is the source of truth.

If any user request conflicts with project documentation:

Follow project documentation.

If documentation is unclear:

Ask for clarification before implementation.
