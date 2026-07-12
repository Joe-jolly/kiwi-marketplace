# ADR-001: Feature-Based Architecture

## Status

Accepted

## Date

2026-07-08

## Context

Kiwi Marketplace is being developed as a scalable marketplace platform.

The project will contain multiple domains including:

- Authentication
- Users
- Posts
- Chats
- Notifications
- Admin Panel
- Mobile Application

A scalable backend structure is required to keep responsibilities isolated.

## Decision

The backend will use Feature-Based Architecture.

Each feature owns its own:

- Module
- Controller
- Service

Infrastructure components such as Prisma, configuration, logging and shared utilities remain outside feature folders.

## Consequences

### Positive

- Better separation of concerns.
- Easier onboarding for new developers.
- Scales well as features grow.
- Lower coupling between features.

### Negative

- Slightly more folders during early development.
- Requires discipline to keep responsibilities inside each feature.