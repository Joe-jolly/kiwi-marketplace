import type { Prisma } from '@prisma/client';

export const postFeedSelect = {
  id: true,
  title: true,
  price: true,
  latitude: true,
  longitude: true,
  status: true,
  createdAt: true,
  owner: {
    select: {
      id: true,
      displayName: true,
    },
  },
  category: {
    select: {
      id: true,
      name: true,
    },
  },
  images: {
    orderBy: {
      displayOrder: 'asc',
    },
    select: {
      imageUrl: true,
      displayOrder: true,
    },
  },
} satisfies Prisma.PostSelect;

export const postDetailSelect = {
  id: true,
  title: true,
  price: true,
  description: true,
  details: true,
  latitude: true,
  longitude: true,
  status: true,
  deletedAt: true,
  // Reservation state (Phase 11): non-sensitive, exposed universally like
  // `status`/`deletedAt` already are — unlike `owner.phone`, there is no
  // leak concern in showing *that* a post has been reserved/completed and
  // *when*, only in showing *to whom* (see `postDetailWithPhoneSelect`).
  reservedChatId: true,
  reservedAt: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
  owner: {
    select: {
      id: true,
      displayName: true,
      avatarUrl: true,
    },
  },
  category: {
    select: {
      id: true,
      name: true,
    },
  },
  images: {
    orderBy: {
      displayOrder: 'asc',
    },
    select: {
      imageUrl: true,
      displayOrder: true,
    },
  },
} satisfies Prisma.PostSelect;

export const mutablePostSelect = {
  id: true,
  ownerId: true,
  status: true,
} satisfies Prisma.PostSelect;

/**
 * `PostsService.selectBuyer()`/`completeListing()` (Phase 11 Reservation):
 * the minimal fields needed to check ownership, the current status-machine
 * precondition (`ACTIVE` for selectBuyer, `RESERVED` for completeListing),
 * and — for `selectBuyer` — that the submitted `chatId` isn't already a
 * stale/foreign value. Mirrors `mutablePostSelect`'s "select only what
 * this operation needs" precedent.
 */
export const reservablePostSelect = {
  id: true,
  ownerId: true,
  status: true,
  reservedChatId: true,
  reservedChat: {
    select: { participantId: true },
  },
} satisfies Prisma.PostSelect;

/**
 * `GET /posts/:id` only. Same shape as `postDetailSelect` plus the extra
 * fields needed to compute Reservation phone-number visibility (Database
 * Constitution §22, Technical Constitution §19): `owner.phone` and the
 * reserved chat's `participantId`. Deliberately **not** merged into
 * `postDetailSelect` itself — that constant is also used by
 * `FavoritesService.findMine()` and `PostsService.create/update/restore()`,
 * none of which apply a per-viewer phone-visibility strip; broadening it
 * there would silently leak the seller's phone number to every viewer of
 * "My Favorites" instead of only the authorized selected buyer. Only
 * `PostsService.findOne()` (the one endpoint with an arbitrary, per-request
 * viewer) uses this select.
 */
export const postDetailWithPhoneSelect = {
  ...postDetailSelect,
  owner: {
    select: {
      id: true,
      displayName: true,
      avatarUrl: true,
      phone: true,
    },
  },
  reservedChat: {
    select: { participantId: true },
  },
} satisfies Prisma.PostSelect;
