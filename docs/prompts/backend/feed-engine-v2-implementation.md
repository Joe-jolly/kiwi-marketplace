# Feed Engine V2 Implementation

Version: 1.0

Status: Approved

Target:
Backend API

Implementation Type:
Production Feature

---

# Mission

Your role is not simply to generate code.

Your role is to act as a Senior Backend Engineer responsible for extending an existing production-grade backend while preserving architecture, maintainability, consistency, and backward compatibility.

The objective is to implement the complete Feed Engine V2 according to the approved architecture and specifications without introducing regressions.

This implementation must follow existing project conventions, architectural decisions, and coding standards.

The goal is to produce production-ready code that could be safely merged into the main branch after review.

---

# Primary Objective

Implement Feed Engine V2 with support for:

- Distance Filtering
- Feed Sorting
- Sort-aware Cursor Pagination
- Chunk Loading Strategy

while preserving all existing functionality including:

- Search
- Category Filter
- Cursor Pagination
- Existing Feed API behavior

The implementation must remain fully compatible with previous features unless explicitly defined otherwise by the specifications.

---

# Required Reading (Mandatory)

Before writing a single line of code, you MUST read and understand every document below.

Architecture Decisions

- docs/adr/ADR-001\*
- docs/adr/ADR-002\*
- docs/adr/ADR-003\*
- docs/adr/ADR-004-feed-pipeline-strategy.md

Feature Specification

- docs/specifications/feed-engine-v2-spec.md

Project Planning

- ROADMAP.md
- BACKLOG.md

Do not begin implementation until every document has been analyzed.

---

# Required Repository Analysis

Before making any changes, analyze the current project structure.

At minimum, inspect every file directly or indirectly related to the feed.

This includes (but is not limited to):

- Posts Module
- DTOs
- Validators
- Feed Query Builder
- Cursor Utilities
- Prisma Queries
- Services
- Controllers
- Swagger decorators
- Enums
- Shared Utilities
- Existing Tests
- Bruno Collection
- Prisma Schema (if necessary)

Do not assume file names.

Discover them from the repository.

---

# Implementation Philosophy

Follow these principles throughout the implementation.

## 1. Architecture First

Architecture is always more important than implementation speed.

Never sacrifice architecture for convenience.

---

## 2. Minimal Changes

Do not rewrite working code.

Do not refactor unrelated components.

Modify only what is necessary to implement Feed Engine V2.

Existing behavior must remain unchanged unless explicitly required by the specification.

---

## 3. Backward Compatibility

Existing API consumers must continue working.

The default behavior of the feed must remain identical when new query parameters are not provided.

Current Search, Category Filter and Cursor Pagination must continue functioning exactly as before.

---

## 4. Single Responsibility Principle

Every class, utility and service must have exactly one responsibility.

Avoid large service classes.

Do not merge unrelated logic.

---

## 5. Feature-Based Architecture

Respect the existing project structure.

Do not move files without a strong architectural reason.

Prefer extending the existing module rather than creating parallel implementations.

---

## 6. Prisma First

Prefer Prisma whenever possible.

Do not introduce raw SQL unless absolutely necessary.

If raw SQL becomes unavoidable, explain why before using it.

---

## 7. Consistency

Every new implementation must match the project's existing style.

Match:

- naming
- folder structure
- dependency injection
- DTO style
- validation style
- error handling
- response format
- Swagger style

The new code should look like it has always been part of the project.

---

# Architecture Constraints

The following architectural decisions are already approved.

Do not redesign them.

- Haversine Formula for distance calculation
- Chunk Loading Strategy
- Sort-aware Cursor Pagination
- Prisma-first implementation
- Feature-based architecture
- Cursor Pagination instead of Offset Pagination

These decisions are final.

Implementation must follow them exactly.

---

# Scope

This implementation includes only Feed Engine V2.

Do not modify unrelated features.

Do not redesign authentication.

Do not redesign posts.

Do not redesign categories.

Do not redesign notifications.

Do not redesign chat.

Do not redesign favorites.

Focus exclusively on Feed Engine V2.

---

# Before Implementation

Before generating code, perform a complete architecture review.

Your first task is analysis.

You must understand:

- current feed flow
- repository structure
- dependency graph
- existing pagination logic
- existing search implementation
- existing category filtering
- existing DTOs
- current cursor implementation

Identify any differences between the current implementation and the approved specification.

If differences exist:

- explain them,
- preserve backward compatibility,
- implement only the minimum changes required.

Do not silently replace existing behavior.

---

# Planning Requirement

Before implementation, create an internal implementation plan.

The plan must include:

- affected files
- newly created files
- existing files to modify
- dependency changes
- execution order

Implementation should begin only after the analysis and planning are complete.

The implementation should proceed in small, logical, reviewable steps rather than one large change.

---

# Absolute Rules

Never assume.

Never guess.

Never ignore existing architecture.

Never duplicate existing functionality.

Never introduce dead code.

Never introduce unused abstractions.

Never over-engineer.

Never sacrifice readability for cleverness.

Always prefer maintainability.

Always preserve deterministic behavior.

Always preserve backward compatibility.

Always follow the approved ADRs and Specifications.

---

# Technical Requirements

The implementation must fully comply with:

- ADR-001
- ADR-002
- ADR-003
- ADR-004 Feed Pipeline Strategy
- Feed Engine V2 Specification

If any implementation detail conflicts with these documents:

- prefer the approved ADRs,
- then the Specification,
- then the existing codebase.

Never invent new architectural decisions.

---

# Business Rules

Implement every business rule exactly as defined in the specification.

This includes, but is not limited to:

- Query validation
- Distance filtering
- Feed sorting
- Stable sorting
- Cursor pagination
- Chunk loading
- Error handling
- Response format

Do not simplify or reinterpret business rules.

---

# Feed Pipeline

The feed pipeline MUST execute in the following order.

1. Query Validation

2. Search Filter

3. Category Filter

4. Database Chunk Fetch

5. Distance Filter

6. Feed Sorting

7. Cursor Pagination

8. Response

The execution order is mandatory.

Do not reorder the pipeline.

---

# Query Validation

Validate every query parameter before any business logic executes.

Validation includes:

- latitude
- longitude
- radius
- sort
- cursor
- limit

Reject invalid requests immediately.

Return appropriate HTTP status codes.

Validation logic must remain inside DTO validation whenever possible.

Avoid manual validation inside services unless unavoidable.

---

# Distance Filter

Implement distance filtering exactly as described by the specification.

Requirements:

- Use the Haversine Formula.
- Perform calculations using double precision.
- Skip distance calculations when location parameters are absent.
- Never include distance in the MVP response.
- Do not use PostGIS.
- Do not use external geo libraries unless already approved.

Distance calculation should be encapsulated inside a dedicated utility or service.

The implementation must remain reusable and easily movable into a shared module in future versions.

---

# Feed Sorting

Implement all approved sorting strategies.

Supported values:

- NEWEST
- PRICE_ASC
- PRICE_DESC
- NEAREST

Default:

NEWEST

Unknown sorting values must return:

400 Bad Request

Do not silently fallback to another sorting mode.

---

# Stable Sorting

Every sorting strategy must be deterministic.

Sorting rules:

NEWEST

createdAt DESC

id DESC

PRICE_ASC

price ASC

id ASC

PRICE_DESC

price DESC

id DESC

NEAREST

distance ASC

id ASC

The secondary field is mandatory.

Never sort using only one field.

Stable sorting is required for deterministic pagination.

---

# Sort-aware Cursor Pagination

Cursor pagination must support every sorting strategy.

Cursor strategy:

NEWEST

createdAt + id

PRICE_ASC

price + id

PRICE_DESC

price + id

NEAREST

distance + id

Cursor payload must remain minimal.

Include only:

- version
- sorting mode
- sorting field
- id

Do not include unnecessary metadata.

Encode the cursor as Base64 JSON using the project's existing cursor strategy.

Maintain backward compatibility whenever possible.

---

# Invalid Cursor Policy

If a cursor belongs to another sorting strategy:

Return

400 Bad Request

Example:

Cursor:

PRICE_ASC

Request:

sort=NEWEST

↓

Reject request.

Do not ignore invalid cursors.

Do not automatically restart pagination.

---

# Chunk Loading Strategy

Implement chunk loading exactly as defined.

Configuration:

CHUNK_MULTIPLIER = 3

Database fetch size:

requestedLimit × CHUNK_MULTIPLIER

If the filtered result count is insufficient:

Fetch the next chunk.

Repeat until:

- enough posts are collected,

or

- MAX_CHUNK_ITERATIONS is reached,

or

- no more posts exist.

Maximum iterations:

MAX_CHUNK_ITERATIONS = 5

Avoid unnecessary database queries.

---

# Service Responsibilities

Preserve Single Responsibility Principle.

Expected responsibilities:

PostsService

Coordinates the feed flow.

FeedQueryBuilder

Builds Prisma query objects only.

DistanceFilter

Calculates and filters by distance.

FeedSorter

Applies sorting strategies.

CursorBuilder

Builds and decodes pagination cursors.

Utilities

Contain reusable helper logic only.

Avoid placing multiple responsibilities into one class.

---

# File Modification Strategy

Before modifying any file:

Understand its current responsibility.

Extend existing files whenever appropriate.

Create new files only when introducing a new responsibility.

Avoid unnecessary fragmentation.

Avoid creating utility classes with only one trivial function.

---

# Dependency Management

Do not introduce new packages unless absolutely required.

Reuse existing dependencies whenever possible.

If a new dependency becomes necessary:

Explain why it is required before introducing it.

---

# Performance Requirements

Implementation should prioritize:

- deterministic pagination
- predictable execution
- minimal allocations
- minimal database queries
- readable code
- maintainable architecture

Avoid premature optimization.

Do not sacrifice readability.

---

# Error Handling

All errors must remain consistent with the project's existing error handling strategy.

Do not invent new response formats.

Use existing exception filters whenever possible.

Validation errors should remain consistent with the rest of the project.

---

# Swagger

Update Swagger documentation for every affected endpoint.

Ensure new query parameters are documented.

Ensure enums appear correctly.

Ensure examples remain accurate.

Swagger must match the implementation exactly.

---

# Backward Compatibility

Existing API consumers must continue working.

Requests without the new parameters must behave exactly as before.

Search behavior must remain unchanged.

Category filtering must remain unchanged.

Existing cursor pagination behavior for NEWEST must not regress.

No existing endpoint should change its response structure unless explicitly required by the specification.

---

# Implementation Expectations

Implementation must prioritize correctness over speed.

Every modification must have a clear architectural purpose.

Do not change code simply because it can be improved.

Only modify code that is necessary to implement Feed Engine V2.

If unrelated improvements are discovered:

Do not implement them.

Mention them only in the final report.

---

# File-by-File Analysis

Before modifying any file:

Understand:

- why the file exists
- its responsibility
- its dependencies
- who depends on it

Never modify a file without understanding its role inside the architecture.

If a responsibility does not belong inside an existing file:

Create a new one.

Otherwise:

Extend the existing implementation.

---

# Code Quality Standards

Every new implementation must follow the project's existing coding style.

Maintain consistency for:

- naming
- folder structure
- imports
- dependency injection
- DTOs
- enums
- validation
- services
- utilities
- Prisma usage
- Swagger decorators

The final code should appear as if it was originally written together with the rest of the project.

---

# Reuse Before Creating

Before creating:

- DTO
- utility
- enum
- service
- helper
- validator

Search the project for an existing implementation.

Reuse existing code whenever appropriate.

Avoid duplication.

---

# Documentation Updates

Only update documentation affected by this feature.

Potential updates include:

- Swagger annotations
- DTO documentation
- Enum documentation
- Inline comments (only when they improve clarity)

Do not rewrite unrelated documentation.

Do not introduce excessive comments.

Code should remain self-explanatory whenever possible.

---

# Existing Architecture Preservation

Preserve all existing architectural patterns.

Do not:

- replace existing services
- redesign modules
- rename public APIs
- change response contracts
- introduce breaking changes

Feed Engine V2 is an extension of the existing architecture.

It is not a redesign.

---

# Testing Strategy

Implementation is not complete without testing.

Testing must include:

## Unit Testing

Verify:

- Haversine calculation
- Cursor encoding
- Cursor decoding
- Sorting behavior
- Stable sorting
- Chunk loading logic

Each unit test should verify one responsibility.

---

## Integration Testing

Verify:

Search

↓

Category

↓

Distance

↓

Sorting

↓

Cursor

↓

Response

The entire pipeline must be validated.

---

## Regression Testing

Verify existing functionality still works.

At minimum:

- Search
- Category filter
- NEWEST sorting
- Existing cursor pagination

No existing behavior should regress.

---

# Bruno Test Matrix

Prepare Bruno tests covering all important scenarios.

At minimum:

## Validation

- Invalid latitude
- Invalid longitude
- Invalid radius
- Invalid sort
- Invalid cursor
- Cursor-sort mismatch

---

## Search

- Search only
- Search + Category
- Search + Distance
- Search + Sorting
- Search + Cursor

---

## Category

- Category only
- Category + Distance
- Category + Sorting

---

## Distance

- Distance only
- Distance + NEWEST
- Distance + PRICE_ASC
- Distance + PRICE_DESC
- Distance + NEAREST

---

## Sorting

Verify:

- NEWEST
- PRICE_ASC
- PRICE_DESC
- NEAREST

Each strategy should be tested independently.

---

## Pagination

Verify:

First page

↓

Second page

↓

Third page

for every sorting strategy.

Verify:

- no duplicates
- no skipped records
- deterministic ordering

---

## Chunk Loading

Verify:

Small radius

↓

Multiple chunk fetches

↓

Correct page size

Also verify:

Maximum iteration behavior.

---

# Edge Cases

Implementation must correctly handle:

- Empty result
- Single result
- Exact limit
- Less than limit
- More than limit
- Equal prices
- Equal createdAt values
- Equal distances
- Maximum limit
- Minimum limit

Edge cases must not produce duplicate or skipped records.

---

# Forbidden Changes

Do NOT:

- replace Prisma
- introduce PostGIS
- introduce offset pagination
- redesign feed architecture
- change authentication
- redesign posts
- redesign categories
- redesign response format
- modify unrelated modules

Any change outside Feed Engine V2 requires explicit justification.

---

# Performance Review

Before completing implementation, verify:

- no unnecessary database queries
- no repeated distance calculations
- no duplicated sorting logic
- no dead code
- no unused imports
- no unnecessary object allocations
- no unnecessary loops

Optimize only when it improves maintainability.

Avoid micro-optimizations.

---

# Self Review

Before considering the implementation complete, perform a complete self-review.

Review:

Architecture

Business Rules

Code Quality

Performance

Readability

Maintainability

Consistency

Swagger

DTOs

Validation

Testing

Only after the review is complete should the implementation be considered ready.

---

# Definition of Done

The implementation is considered complete only if ALL of the following conditions are satisfied.

## Architecture

- All approved ADRs have been respected.
- The implementation follows the Feed Engine V2 Specification.
- No architectural decisions have been replaced or reinterpreted.
- Feature-based architecture has been preserved.

---

## Functionality

Feed Engine V2 correctly supports:

- Search
- Category Filter
- Distance Filter
- Feed Sorting
- Stable Sorting
- Sort-aware Cursor Pagination
- Chunk Loading

All supported combinations must work correctly.

---

## Validation

Every query parameter is properly validated.

Invalid requests return appropriate HTTP status codes.

Validation behavior remains consistent with the rest of the project.

---

## Backward Compatibility

Existing API behavior remains unchanged unless explicitly required by the specification.

Existing clients continue working without modifications.

No regressions have been introduced.

---

## Code Quality

The implementation contains:

- no dead code
- no duplicated logic
- no unnecessary abstractions
- no unnecessary complexity
- no unused imports
- no unused variables

The implementation remains readable and maintainable.

---

## Documentation

Swagger reflects the implementation.

New query parameters are documented.

Enums are correctly documented.

Documentation matches the actual API behavior.

---

## Testing

Bruno tests cover the implemented feature.

Regression scenarios have been verified.

Edge cases have been considered.

The implementation is ready for manual review.

---

# Acceptance Criteria

The implementation will be accepted only if it satisfies all of the following requirements.

- Architecture remains consistent.
- Business rules are fully implemented.
- Existing features continue working.
- Feed behavior is deterministic.
- Cursor pagination remains stable.
- No duplicate records are produced.
- No records are skipped.
- Response format remains unchanged.
- Performance remains acceptable.
- The implementation is production-ready.

---

# Final Implementation Report

After implementation is complete, provide a structured report.

The report must include the following sections.

## 1. Repository Analysis

Summarize:

- analyzed modules
- existing architecture
- implementation strategy

---

## 2. Modified Files

List every modified file.

Briefly explain why each file was modified.

---

## 3. Newly Created Files

List every newly created file.

Explain the responsibility of each file.

---

## 4. Deleted Files

List deleted files.

If no files were deleted, explicitly state:

None.

---

## 5. Dependency Changes

List:

- added dependencies
- removed dependencies

If none:

State:

No dependency changes.

---

## 6. Database Changes

List:

- Prisma schema changes
- migrations
- seed updates

If none:

State:

No database changes.

---

## 7. Swagger Updates

Summarize all Swagger modifications.

---

## 8. Testing Summary

Summarize:

- unit testing
- integration testing
- Bruno testing
- regression testing

Mention any scenarios that could not be tested.

---

## 9. Known Limitations

Document any remaining limitations that are intentionally left for future iterations.

Do not classify incomplete implementation as a limitation.

---

## 10. Follow-up Recommendations

Provide recommendations only if they are directly related to future evolution of Feed Engine.

Do not suggest unrelated refactoring.

---

# Completion Rules

Do not claim the implementation is complete unless every required task has been finished.

If any required item remains incomplete:

Clearly identify it.

Do not hide unfinished work.

---

# Engineering Principles

Throughout the implementation, always prioritize:

1. Correctness over speed.
2. Architecture over convenience.
3. Maintainability over cleverness.
4. Consistency over personal preference.
5. Minimal change over unnecessary refactoring.
6. Deterministic behavior over implicit assumptions.
7. Readability over micro-optimization.

These principles are mandatory.

---

# Final Instruction

This document defines the implementation requirements for Feed Engine V2.

Treat it as the primary execution guide throughout the implementation.

Before writing code:

Analyze.

Plan.

Verify.

Only then implement.

During implementation:

Work incrementally.

Continuously verify architectural consistency.

Preserve backward compatibility.

Avoid unnecessary changes.

After implementation:

Perform a complete self-review.

Validate all acceptance criteria.

Generate the Final Implementation Report.

Only then consider the task complete.
