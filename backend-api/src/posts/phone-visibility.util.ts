import { PostStatus } from '@prisma/client';

/**
 * Reservation Constitution (Database Constitution §22, Technical
 * Constitution §19, Project Constitution §8 Rule 6): "Selected user gains
 * phone visibility" — one-directional only. Only the selected buyer (the
 * `reservedChat`'s `participantId`) gains visibility of the seller's phone
 * number, and only once the post has actually been reserved (or
 * completed, since nothing un-reveals it on completion). No document
 * describes the reverse (seller seeing the buyer's number), so no such
 * rule is implemented here.
 *
 * This is an *ongoing authorization check*, not a one-time reveal action —
 * callers re-evaluate it on every read (`GET /posts/:id`, `GET /chats`,
 * `GET /chats/:chatId`) rather than persisting a "revealed" flag anywhere.
 *
 * Pure and DB-free by design, mirroring `resolveChatRole()`/
 * `isPostHiddenFromPublic()`'s precedent: callers pass in the already-
 * fetched minimal fields and only decide what to do (include or strip the
 * phone field) based on the boolean returned.
 */
export function canViewSellerPhone(
  post: { status: PostStatus; reservedChatId: string | null },
  reservedChatParticipantId: string | null,
  viewerId: string,
): boolean {
  const isReservationActive =
    post.reservedChatId !== null &&
    (post.status === PostStatus.RESERVED ||
      post.status === PostStatus.COMPLETED);

  return isReservationActive && reservedChatParticipantId === viewerId;
}
