export type ChatRole = 'owner' | 'participant';

/**
 * A chat has exactly two sides: the post's owner and the chat's
 * `participant` (Database Constitution §11 — "Many Chats : One Post",
 * "One Chat : Many Messages"). This is the single place that decides which
 * side (if either) a given user is on, so every endpoint that needs an
 * authorization check on a chat (`GET/POST /chats/:chatId/...`) resolves
 * role the same way instead of re-deriving it inline.
 *
 * Pure and DB-free by design: callers pass in the two ids already fetched
 * via whichever minimal Prisma select fits their use case, and only decide
 * what to do (throw `ForbiddenException`, pick a watermark column, etc.)
 * based on the returned role.
 */
export function resolveChatRole(
  chat: { participantId: string; post: { ownerId: string } },
  userId: string,
): ChatRole | null {
  if (chat.post.ownerId === userId) {
    return 'owner';
  }

  if (chat.participantId === userId) {
    return 'participant';
  }

  return null;
}
