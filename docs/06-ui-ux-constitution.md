# Kiwi Marketplace

## UI / UX Constitution

Version: 1.0

Status: Approved

---

# 1. Design Philosophy

Kiwi is a marketplace.

The interface exists to help users:

Post

↓

Chat

↓

Deal

Every UI decision must support this flow.

Visual decoration must never reduce usability.

---

# 2. Design Principles

Primary Principles:

* Marketplace First
* Content First
* Fast Navigation
* Minimal Friction
* Trust First

Secondary Principles:

* Consistency
* Accessibility
* Simplicity
* Predictability

---

# 3. Design Inspiration

Primary Reference:

Karrot Market

Important Characteristics:

* Clean Layout
* Fast Navigation
* Large Content Area
* Minimal Visual Noise

Kiwi should be inspired by Karrot, not copied.

---

# 4. Theme Constitution

Supported Themes:

* Light Mode
* Dark Mode

Both themes are mandatory.

Theme switching must be supported globally.

The user should never lose functionality due to theme changes.

---

# 5. Color Constitution

Primary Color:

Kiwi Green

#6BCB3D

Secondary Colors:

#1B5E20

#A4E635

Neutral Colors:

Background:

#F5F7F5

Surface:

#FFFFFF

Primary Text:

#1A1A1A

Secondary Text:

#6B7280

Border:

#E5E7EB

Color usage must remain consistent throughout the application.

---

# 6. Typography Constitution

Primary Font:

Inter

Secondary Font:

Pretendard

Typography Priority:

Readability First

Supported Text Types:

* Display
* Heading
* Title
* Body
* Caption

Font sizes must be standardized.

Random font sizing is prohibited.

---

# 7. Spacing Constitution

Spacing Scale:

4

8

12

16

24

32

48

Only approved spacing values should be used.

Consistency is more important than perfection.

---

# 8. Border Radius Constitution

Standard Radius:

8px

Large Radius:

12px

Card Radius:

16px

Avoid excessive rounding.

The interface should feel modern and practical.

---

# 9. Navigation Constitution

Bottom Navigation Tabs:

* Home
* Search
* Create
* Chats
* Profile

Maximum:

5 Tabs

Navigation should always remain simple.

---

# 10. Home Screen Constitution

Purpose:

Discovery

Responsibilities:

* Nearby Listings
* New Listings
* Categories
* Search Entry

Default Sorting:

Nearest

↓

Newest

Home must prioritize content visibility.

---

# 11. Search Screen Constitution

Purpose:

Finding Listings

Features:

* Search Bar
* Recent Searches
* Filters
* Category Selection

Search should require minimal effort.

---

# 12. Post Card Constitution

Post Card is a shared component.

Location:

features/posts/components/PostCard

Post Card must be used consistently.

Required Elements:

* Thumbnail
* Title
* Price
* Location
* Created Time

Post Card should prioritize scanning speed.

---

# 13. Post Detail Constitution

Purpose:

Convert browsing into chatting.

Priority Order:

Images

↓

Title

↓

Price

↓

Description

↓

Chat Action

Chat CTA must remain highly visible.

---

# 14. Create Post Constitution

Purpose:

Fast Listing Creation

Requirements:

* Category Selection
* Dynamic Form
* Image Upload
* Preview Support

Form complexity should be minimized.

---

# 15. Chat Screen Constitution

Purpose:

Fast Communication

Supported:

Text Messages

Only

MVP does not support:

* Images
* Files
* Voice

---

# 16. Message UI Constitution

Message Bubble:

Timestamp:

Inside Message Bubble

Bottom Left

Small Text

Read Receipts:

Outside Message Bubble

Bottom Area

Supported States:

✓

✓✓

Message readability takes priority.

---

# 17. Chat Header Constitution

Header Includes:

* User Name
* Call Action

Call Action:

Opens Phone Dialer

The application does not provide voice calling.

---

# 18. Notifications Constitution

Notifications appear through:

Bell Icon

Dedicated notifications screen is not part of MVP.

Unread counts must be visible.

---

# 19. Loading State Constitution

Every screen must support loading states.

Preferred Components:

* Skeleton Loaders
* Loading Indicators

Blank screens are prohibited.

---

# 20. Empty State Constitution

Every screen must support empty states.

Examples:

No Posts

No Favorites

No Messages

Empty states should guide the user toward useful actions.

---

# 21. Error State Constitution

Technical errors must never be shown directly.

Bad:

Database Error

500 Error

Stack Trace

Good:

Unable to load posts.

Please try again.

Messages must be human-friendly.

---

# 22. Offline Constitution

Offline Mode Banner is required.

Banner Example:

Offline Mode

Showing previously loaded content.

Cached data should remain visible whenever possible.

---

# 23. Guest User Constitution

Guest restrictions must be explained clearly.

Examples:

Save Favorite

Start Chat

Create Post

Report Content

When blocked:

Show authentication prompt.

Do not show technical permission errors.

---

# 24. Accessibility Constitution

Text must remain readable.

Tap targets must remain comfortable.

Color contrast must remain accessible.

Accessibility is not optional.

---

# 25. Animation Constitution

Animations should be subtle.

Purpose:

* Feedback
* Transitions
* State Changes

Animations must never delay user actions.

---

# 26. Image Constitution

Images should load progressively.

Compression is required.

WebP is preferred.

Performance takes priority over image quality.

---

# 27. Form Constitution

Forms must:

* Validate Early
* Explain Errors Clearly
* Preserve User Input

Users should never lose form progress unexpectedly.

---

# 28. Dark Mode Constitution

Dark mode is required.

Dark mode should use dedicated color tokens.

Pure black is discouraged.

Comfortable reading is the goal.

---

# 29. Design System Constitution

Reusable Components:

* Button
* Input
* Modal
* PostCard
* Avatar
* Badge
* EmptyState
* LoadingState

Component reuse is mandatory.

Duplicate UI implementations are discouraged.

---

# 30. Final Rule

Every UI decision must answer:

Does this help the user move from Post → Chat → Deal faster?

If not, it should be reconsidered.
