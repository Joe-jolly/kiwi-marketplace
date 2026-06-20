# Kiwi Marketplace

## Implementation Roadmap

Version: 1.0

Status: Approved

---

# 1. Roadmap Philosophy

The roadmap exists to reduce complexity.

Development must follow a predictable sequence.

Features should be built in dependency order.

Never build advanced features before foundational systems exist.

Principle:

Foundation First

Feature Second

Optimization Last

---

# 2. MVP Objective

Goal:

Launch a working marketplace for migrants in South Korea.

Core Marketplace Flow:

Browse

↓

Search

↓

Open Post

↓

Chat

↓

Reserve

↓

Call

↓

Deal

Anything outside this flow is not MVP.

---

# 3. Phase 0

Development Environment

Status:

Preparation Phase

Goals:

* Prepare development machine
* Configure tooling
* Create repositories
* Establish project standards

Deliverables:

* Cursor Installed
* Git Installed
* GitHub Ready
* NVM Installed
* Node.js Installed
* PostgreSQL Installed
* Docker Installed

Exit Criteria:

Development environment fully operational.

---

# 4. Phase 1

Project Foundation

Goal:

Create technical foundation.

Backend:

* NestJS Project
* Prisma Setup
* PostgreSQL Connection
* Docker Configuration
* Environment Variables

Mobile:

* React Native Project
* TypeScript Setup
* Redux Toolkit
* RTK Query
* Navigation

Deliverables:

Running backend and mobile application.

Exit Criteria:

Applications start successfully.

---

# 5. Phase 2

Authentication System

Goal:

Secure user access.

Features:

* Registration
* Login
* Logout
* JWT Authentication
* Refresh Tokens
* SMS Verification

Deliverables:

Authenticated users.

Exit Criteria:

Protected routes working correctly.

---

# 6. Phase 3

Categories Module

Goal:

Organize marketplace content.

Features:

* Categories API
* Categories Screen
* Category Selection

Deliverables:

Marketplace categories available.

Exit Criteria:

Users can browse categories.

---

# 7. Phase 4

Posts Module

Goal:

Marketplace listings.

Features:

* Create Post
* Edit Post
* Delete Post
* Post Status
* Dynamic JSONB Details

Deliverables:

Complete listing workflow.

Exit Criteria:

Users can publish listings.

---

# 8. Phase 5

Image Upload System

Goal:

Support listing images.

Features:

* Cloudflare R2
* Image Compression
* WebP Conversion
* Image Ordering

Limit:

15 images per post

Deliverables:

Image upload working.

Exit Criteria:

Listings support images.

---

# 9. Phase 6

Home Feed

Goal:

Marketplace discovery.

Features:

* Nearby Feed
* New Listings
* Categories
* Pagination

Sorting:

Nearest

↓

Newest

Deliverables:

Marketplace browsing experience.

Exit Criteria:

Users can discover listings.

---

# 10. Phase 7

Search System

Goal:

Find listings quickly.

Features:

* Search
* Filters
* Recent Searches
* Category Filters

Search Sources:

* Title
* Description
* Category
* JSONB Details

Deliverables:

Search functionality.

Exit Criteria:

Users can find relevant listings.

---

# 11. Phase 8

Favorites System

Goal:

Save listings.

Features:

* Add Favorite
* Remove Favorite
* Favorites Screen

Deliverables:

Favorites workflow.

Exit Criteria:

Users can manage saved listings.

---

# 12. Phase 9

Chat System

Goal:

Buyer-seller communication.

Features:

* Chat Creation
* Message Sending
* Message Reading
* Read Receipts
* Realtime Updates

Technology:

Socket.IO

MVP:

Text Only

Deliverables:

Working chat experience.

Exit Criteria:

Users can communicate.

---

# 13. Phase 10

Reservation Flow

Goal:

Support transactions.

Features:

* Select Buyer
* Reserve Listing
* Reveal Phone Number
* Complete Listing

Deliverables:

Reservation workflow.

Exit Criteria:

Users can move toward real-world deals.

---

# 14. Phase 11

Notifications

Goal:

Increase responsiveness.

Features:

* Message Notifications
* Reservation Notifications
* Bell Icon Notifications
* Unread Counters

Deliverables:

Notification system.

Exit Criteria:

Users receive important updates.

---

# 15. Phase 12

Reports & Safety

Goal:

Protect marketplace quality.

Features:

* Report User
* Report Post
* Block User
* Moderation Tools

Deliverables:

Safety systems.

Exit Criteria:

Users can report abuse.

---

# 16. Phase 13

Admin Panel

Goal:

Marketplace management.

Features:

* Dashboard
* User Management
* Post Management
* Reports Management

Technology:

Web Admin Panel

Deliverables:

Operational control panel.

Exit Criteria:

Marketplace moderation possible.

---

# 17. Phase 14

Polish & Optimization

Goal:

Improve stability.

Tasks:

* Bug Fixes
* Refactoring
* UI Improvements
* Performance Checks

Deliverables:

Release Candidate.

Exit Criteria:

Major issues resolved.

---

# 18. Phase 15

Production Deployment

Goal:

Public launch.

Infrastructure:

* VPS
* Docker
* Nginx
* HTTPS
* PostgreSQL

Deliverables:

Live production environment.

Exit Criteria:

Public users can access Kiwi.

---

# 19. MVP Completion Definition

MVP is complete when users can:

* Register
* Verify SMS
* Create Posts
* Upload Images
* Search Listings
* Save Favorites
* Chat
* Reserve Listings
* Access Phone Numbers
* Report Abuse

Successfully.

---

# 20. Post-MVP Roadmap

Future Features:

* Chat Images
* Jobs Marketplace
* Housing Marketplace
* Services Marketplace
* Multi-Currency Support
* Advanced Search
* Analytics

Not part of MVP.

---

# 21. Success Milestones

Milestone 1

First User Registration

Milestone 2

First Listing Created

Milestone 3

First Chat Started

Milestone 4

First Reservation

Milestone 5

First Real Deal

Milestone 6

First 100 Users

Milestone 7

First 1000 Users

---

# 22. Final Rule

Development must follow roadmap order.

Skipping foundational phases is prohibited.

Stable progress is preferred over rapid but unstable development.
