# Kiwi Marketplace

## Development Constitution

Version: 1.0

Status: Approved

---

# 1. Development Philosophy

Development must prioritize:

* Consistency
* Simplicity
* Maintainability
* Reliability

The goal is not to write code quickly.

The goal is to build a stable marketplace that can be maintained for years.

---

# 2. Founder Principle

The founder owns product decisions.

Architecture documents define technical decisions.

Code must follow documented decisions.

Implementation must never redefine business rules.

---

# 3. Development Order Constitution

Features must be developed in roadmap order.

Approved Sequence:

1. Foundation
2. Authentication
3. Categories
4. Posts
5. Uploads
6. Feed & Search
7. Favorites
8. Chat
9. Reservation Flow
10. Notifications
11. Reports
12. Admin Panel
13. Production Deployment

Development outside roadmap order requires approval.

---

# 4. Git Strategy

Version Control:

Git

Repository Host:

GitHub

Git is the single source of truth for code.

Code stored outside Git repositories is not considered reliable.

---

# 5. Repository Strategy

MVP Structure:

backend-api

mobile-app

admin-panel

Separate repositories are preferred.

Monorepo is not part of MVP.

---

# 6. Branch Strategy

Permanent Branches:

main

develop

Definitions:

main

Production-ready code.

develop

Current development work.

---

# 7. Feature Branch Constitution

Feature branches are optional during MVP.

Reason:

Single developer workflow.

Example:

feature/auth

feature/posts

feature/chat

Feature branches may be introduced if development complexity increases.

---

# 8. Commit Constitution

Commits must be:

* Small
* Focused
* Understandable

Bad:

"update"

"fix"

"changes"

Good:

feat(auth): add refresh token rotation

fix(posts): validate image count

refactor(chat): simplify message mapping

---

# 9. Commit Frequency Constitution

Commit after completing meaningful work.

Examples:

* Completed API
* Completed Screen
* Completed Feature

Large uncommitted changes are discouraged.

---

# 10. Pre-Commit Constitution

Before commit:

Code must:

* Build Successfully
* Pass Validation
* Pass Linting

Broken builds must never be committed.

---

# 11. Pull Request Constitution

Future Team Rule.

Every Pull Request must:

* Have a clear purpose
* Be reviewable
* Be testable

Large unrelated Pull Requests are prohibited.

---

# 12. Code Review Constitution

Every code change should be reviewed.

Review Questions:

* Does it follow architecture?
* Does it follow business rules?
* Is it maintainable?
* Is it secure?
* Is it understandable?

Readable code is preferred over clever code.

---

# 13. Testing Philosophy

Testing Priority:

Business Logic First

Critical Flows:

* Registration
* Login
* Create Post
* Search
* Chat
* Reservation

Critical flows must always be tested.

---

# 14. Manual Testing Constitution

Every completed feature requires manual testing.

Minimum Testing:

Happy Path

Failure Path

Validation Path

Untested code is considered incomplete.

---

# 15. Bug Fix Constitution

Bug fixes require:

1. Reproduction
2. Root Cause
3. Fix
4. Verification

Fixing symptoms without understanding the cause is prohibited.

---

# 16. Folder Structure Constitution

Frontend Architecture:

Feature-Based

Examples:

features/auth

features/posts

features/chats

features/profile

Business logic should not live inside screens.

---

# 17. Naming Constitution

Names must be:

* Clear
* Predictable
* Consistent

Avoid abbreviations unless universally understood.

Examples:

PostCard

CreatePostScreen

ChatList

Bad Examples:

PC

CPS

MsgUtil

---

# 18. Reusability Constitution

Before creating a component:

Ask:

Can an existing component be reused?

Component duplication should be minimized.

---

# 19. Dependency Constitution

Every new dependency requires justification.

Questions:

Why is it needed?

Can existing tools solve the problem?

Dependencies increase maintenance cost.

---

# 20. Refactoring Constitution

Refactoring is encouraged when it improves:

* Readability
* Maintainability
* Simplicity

Refactoring must not change business behavior.

---

# 21. Documentation Constitution

Important architectural decisions must be documented.

Undocumented critical decisions are discouraged.

Documentation is part of development.

---

# 22. Cursor Workflow Constitution

Cursor assists development.

Cursor does not define architecture.

Cursor does not define business rules.

Cursor does not override constitutions.

Cursor generates implementation.

Humans make decisions.

---

# 23. Cursor Prompt Constitution

Prompts should contain:

Context

Task

Requirements

Restrictions

Expected Output

Large vague prompts are discouraged.

---

# 24. Cursor Review Constitution

Every Cursor output must be reviewed.

Review Areas:

* Business Logic
* Architecture
* Security
* Naming
* Folder Structure

Generated code must never be accepted blindly.

---

# 25. Debugging Constitution

When reporting bugs:

Provide:

* Expected Behavior
* Actual Behavior
* Error Logs
* Reproduction Steps

Clear bug reports improve fix quality.

---

# 26. Security Constitution

Security takes priority over convenience.

Never:

* Hardcode Secrets
* Commit Credentials
* Expose Internal APIs

Secrets belong in environment variables.

---

# 27. Environment Constitution

Environment Files:

.env.development

.env.production

Development and production settings must remain separate.

---

# 28. Development Database Constitution

Development data and production data must never be mixed.

Development environments must be isolated.

Production data must remain protected.

---

# 29. Continuous Improvement Constitution

Every major milestone should include:

* Review
* Cleanup
* Refactoring

Technical debt should be managed continuously.

---

# 30. Final Rule

Development speed is important.

Development quality is mandatory.

When forced to choose:

Choose long-term maintainability over short-term convenience.
