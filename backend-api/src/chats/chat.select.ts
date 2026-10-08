import type { Prisma } from '@prisma/client';

/**
 * Minimal shape needed purely to authorize/route an action against an
 * existing chat (`resolveChatRole`, the COMPLETED-post gate is intentionally
 * *not* re-checked here — see `chats.service.ts`). Mirrors `mutablePostSelect`'s
 * "select only what this operation needs" precedent.
 */
export const chatAccessSelect = {
  id: true,
  participantId: true,
  post: {
    select: { ownerId: true },
  },
} satisfies Prisma.ChatSelect;

/**
 * Full "chat summary" shape used by both `GET /chats` (list) and
 * `GET /chats/:chatId` (detail) — same fields, one list item vs. one row.
 * Embeds the single most recent message (`messages: { take: 1 }`) in the
 * same query rather than a separate per-row fetch; `unreadCount` still
 * requires one bounded `count()` per row (see `chats.service.ts`), since a
 * per-row "count messages newer than *this row's own* watermark" can't be
 * expressed as a single nested `include` filter.
 */
export const chatSummarySelect = {
  id: true,
  createdAt: true,
  lastMessageAt: true,
  ownerLastReadAt: true,
  participantLastReadAt: true,
  participantId: true,
  post: {
    select: {
      id: true,
      ownerId: true,
      title: true,
      price: true,
      status: true,
      owner: {
        select: { id: true, displayName: true, avatarUrl: true },
      },
      images: {
        orderBy: { displayOrder: 'asc' },
        take: 1,
        select: { imageUrl: true, displayOrder: true },
      },
    },
  },
  participant: {
    select: { id: true, displayName: true, avatarUrl: true },
  },
  messages: {
    orderBy: { createdAt: 'desc' },
    take: 1,
    select: { id: true, senderId: true, content: true, createdAt: true },
  },
} satisfies Prisma.ChatSelect;

export const messageSelect = {
  id: true,
  chatId: true,
  senderId: true,
  content: true,
  createdAt: true,
} satisfies Prisma.MessageSelect;
