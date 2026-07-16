# ADR-002: Feed API Design

## Status

Accepted

## Date

2026-07-16

## Context

The Home Feed is the most frequently used endpoint in Kiwi Marketplace.

The API should return only the data required to render marketplace cards while minimizing payload size and keeping the response extensible.

## Decision

GET /posts (Home Feed V1) returns:

### Post

- id
- title
- price
- latitude
- longitude
- status
- createdAt

### Owner

Nested object:

- id
- displayName

### Category

Nested object:

- id
- name

### Images

Nested array:

- imageUrl
- displayOrder

The endpoint does NOT return:

- description
- details
- updatedAt

The endpoint:

- is public
- returns only ACTIVE posts
- sorts by createdAt DESC
- uses Prisma select instead of include

## Consequences

Benefits:

- Smaller response payload
- Better query performance
- API closely matches frontend requirements
- Easier to extend nested owner/category objects in future
- Prevents exposing unnecessary database fields

Future Improvements (V2):

- Cursor pagination
- Distance-based sorting
- Search
- Category filtering
- Price filtering
- distanceMeters field
