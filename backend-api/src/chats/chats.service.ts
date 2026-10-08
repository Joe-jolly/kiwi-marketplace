import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PostStatus } from '@prisma/client';
import type { Prisma, User } from '@prisma/client';
import { CursorPaginationQueryDto } from '../common/dto/cursor-pagination-query.dto';
import {
  decodeKeysetCursor,
  encodeKeysetCursor,
} from '../common/pagination/keyset-cursor.util';
import { canViewSellerPhone } from '../posts/phone-visibility.util';
import { isPostHiddenFromPublic } from '../posts/post-visibility.util';
import { mutablePostSelect } from '../posts/post.select';
import { resolveImageUrls } from '../posts/resolve-image-urls.util';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { resolveChatRole } from './chat-role.util';
import { ChatsGateway } from './chats.gateway';
import {
  chatAccessSelect,
  chatSummarySelect,
  messageSelect,
} from './chat.select';
import { SendMessageDto } from './dto/send-message.dto';

/** `GET /chats` sorts by `lastMessageAt desc, id desc` (most recently active
 * conversation first); `GET /chats/:chatId/messages` sorts by `createdAt
 * desc, id desc`. Distinct purposes keep a cursor from one endpoint from
 * silently decoding against the other's different sort semantics — same
 * reasoning as `favorites-mine` vs. `posts-mine`. */
const CHATS_CURSOR_PURPOSE = 'chats-mine';
const MESSAGES_CURSOR_PURPOSE = 'chat-messages';

type ChatSummaryRow = Prisma.ChatGetPayload<{
  select: typeof chatSummarySelect;
}>;

@Injectable()
export class ChatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly chatsGateway: ChatsGateway,
  ) {}

  /**
   * `POST /posts/:postId/messages` — "Create Chat" (API Constitution §17),
   * done lazily: no `Chat` row exists until the first message is actually
   * sent (Step 1 design decision). If this caller already has a chat for
   * this post, it's reused instead of rejected — "Duplicate chats must not
   * be created" (API Constitution §24) means this endpoint is also just
   * "send the next message" for a caller who already started the
   * conversation, not only a "first message" endpoint.
   *
   * The "no new chats" rule for a COMPLETED post (Database Constitution
   * §_) only blocks *creating a new* chat here — it does not block sending
   * more messages once a chat already exists (approved Step 1 decision;
   * see `sendMessage` below, which has no such check at all).
   */
  async sendFirstMessage(postId: string, sender: User, dto: SendMessageDto) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: mutablePostSelect,
    });

    if (!post || isPostHiddenFromPublic(post.status)) {
      throw new NotFoundException('Post not found');
    }

    if (post.ownerId === sender.id) {
      throw new ForbiddenException(
        'You cannot start a chat with yourself about your own post',
      );
    }

    let chat = await this.prisma.chat.findUnique({
      where: {
        postId_participantId: { postId, participantId: sender.id },
      },
      select: { id: true },
    });

    if (!chat) {
      if (post.status === PostStatus.COMPLETED) {
        throw new ConflictException(
          'This post is completed; new chats cannot be started',
        );
      }

      chat = await this.prisma.chat.create({
        data: { postId, participantId: sender.id },
        select: { id: true },
      });
    }

    return this.appendMessage(chat.id, sender.id, dto.content, [
      post.ownerId,
      sender.id,
    ]);
  }

  /**
   * `POST /chats/:chatId/messages` — "Send Message" (API Constitution §17)
   * on a chat that already exists, used by both the owner and the
   * participant. Deliberately has no COMPLETED-post check: an existing
   * chat keeps accepting messages regardless of the post's current status
   * (approved Step 1 decision — only *new* chat creation is blocked).
   */
  async sendMessage(chatId: string, sender: User, dto: SendMessageDto) {
    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
      select: chatAccessSelect,
    });

    if (!chat) {
      throw new NotFoundException('Chat not found');
    }

    if (!resolveChatRole(chat, sender.id)) {
      throw new ForbiddenException('You are not a participant in this chat');
    }

    return this.appendMessage(chat.id, sender.id, dto.content, [
      chat.post.ownerId,
      chat.participantId,
    ]);
  }

  /**
   * "My Chats" — `GET /chats` (API Constitution §17 "Get Chats"). Includes
   * every chat where the caller is either side (owner or participant),
   * sorted by `lastMessageAt desc` so the most recently active
   * conversation surfaces first — the sort order every chat list UI
   * expects, and not the same as `createdAt` (when the chat first started).
   */
  async findMine(user: User, query: CursorPaginationQueryDto) {
    const cursor = decodeKeysetCursor(CHATS_CURSOR_PURPOSE, query.cursor);

    const baseWhere: Prisma.ChatWhereInput = {
      OR: [{ participantId: user.id }, { post: { ownerId: user.id } }],
    };

    const cursorWhere: Prisma.ChatWhereInput | undefined = cursor
      ? {
          OR: [
            { lastMessageAt: { lt: cursor.sortValue } },
            { lastMessageAt: cursor.sortValue, id: { lt: cursor.id } },
          ],
        }
      : undefined;

    const rows = await this.prisma.chat.findMany({
      where: cursorWhere ? { AND: [baseWhere, cursorWhere] } : baseWhere,
      orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      select: chatSummarySelect,
    });

    const hasNextPage = rows.length > query.limit;
    const pageRows = hasNextPage ? rows.slice(0, query.limit) : rows;

    const summaries = pageRows.map((row) =>
      this.buildChatSummary(row, user.id),
    );
    const items = await this.attachUnreadCounts(summaries, user.id);

    const lastRow = pageRows.at(-1);
    const nextCursor =
      hasNextPage && lastRow
        ? encodeKeysetCursor(
            CHATS_CURSOR_PURPOSE,
            lastRow.lastMessageAt,
            lastRow.id,
          )
        : null;

    return { items, nextCursor, hasNextPage };
  }

  /**
   * `GET /chats/:chatId` — single chat detail, same shape as one `GET
   * /chats` list item. A chat that exists but isn't yours is a 403, not a
   * 404: chat ids are opaque, non-enumerable UUIDs, so there's no
   * existence-hiding benefit here the way there is for e.g. hidden posts.
   */
  async findOne(chatId: string, user: User) {
    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
      select: chatSummarySelect,
    });

    if (!chat) {
      throw new NotFoundException('Chat not found');
    }

    if (!resolveChatRole(chat, user.id)) {
      throw new ForbiddenException('You are not a participant in this chat');
    }

    const [item] = await this.attachUnreadCounts(
      [this.buildChatSummary(chat, user.id)],
      user.id,
    );

    return item;
  }

  /**
   * `GET /chats/:chatId/messages` — "Get Messages" (API Constitution §17),
   * newest-first and cursor-paginated (`createdAt desc, id desc`), the same
   * pattern as `GET /favorites` and `GET /posts/me`.
   */
  async findMessages(
    chatId: string,
    user: User,
    query: CursorPaginationQueryDto,
  ) {
    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
      select: chatAccessSelect,
    });

    if (!chat) {
      throw new NotFoundException('Chat not found');
    }

    if (!resolveChatRole(chat, user.id)) {
      throw new ForbiddenException('You are not a participant in this chat');
    }

    const cursor = decodeKeysetCursor(MESSAGES_CURSOR_PURPOSE, query.cursor);

    const baseWhere: Prisma.MessageWhereInput = { chatId };
    const cursorWhere: Prisma.MessageWhereInput | undefined = cursor
      ? {
          OR: [
            { createdAt: { lt: cursor.sortValue } },
            { createdAt: cursor.sortValue, id: { lt: cursor.id } },
          ],
        }
      : undefined;

    const rows = await this.prisma.message.findMany({
      where: cursorWhere ? { AND: [baseWhere, cursorWhere] } : baseWhere,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      select: messageSelect,
    });

    const hasNextPage = rows.length > query.limit;
    const pageRows = hasNextPage ? rows.slice(0, query.limit) : rows;

    const lastRow = pageRows.at(-1);
    const nextCursor =
      hasNextPage && lastRow
        ? encodeKeysetCursor(
            MESSAGES_CURSOR_PURPOSE,
            lastRow.createdAt,
            lastRow.id,
          )
        : null;

    return { items: pageRows, nextCursor, hasNextPage };
  }

  /**
   * `POST /chats/:chatId/reads` — advances the caller's own read watermark
   * to now. Not one of the API Constitution §17 named operations, but
   * required by the approved "last-read watermark" read-receipt design:
   * without it, `ownerLastReadAt`/`participantLastReadAt` would never move.
   */
  async markRead(chatId: string, user: User): Promise<void> {
    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
      select: chatAccessSelect,
    });

    if (!chat) {
      throw new NotFoundException('Chat not found');
    }

    const role = resolveChatRole(chat, user.id);

    if (!role) {
      throw new ForbiddenException('You are not a participant in this chat');
    }

    const readAt = new Date();

    await this.prisma.chat.update({
      where: { id: chatId },
      data:
        role === 'owner'
          ? { ownerLastReadAt: readAt }
          : { participantLastReadAt: readAt },
    });

    this.chatsGateway.notifyRead([chat.post.ownerId, chat.participantId], {
      chatId,
      readByUserId: user.id,
      readAt,
    });
  }

  /** Creates the message and bumps `Chat.lastMessageAt` atomically, so a
   * chat's position in `GET /chats` always reflects its true latest
   * message even under concurrent sends. Emits `message:new` to both sides
   * only after that transaction has committed — the realtime push is
   * never allowed to affect whether the REST mutation itself succeeds
   * (`ChatsGateway.notifyNewMessage` is best-effort/non-throwing). */
  private async appendMessage(
    chatId: string,
    senderId: string,
    content: string,
    participantUserIds: readonly [string, string],
  ) {
    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: { chatId, senderId, content },
        select: messageSelect,
      });

      await tx.chat.update({
        where: { id: chatId },
        data: { lastMessageAt: created.createdAt },
      });

      return created;
    });

    this.chatsGateway.notifyNewMessage(participantUserIds, message);

    return message;
  }

  private buildChatSummary(chat: ChatSummaryRow, callerId: string) {
    const role = chat.post.owner.id === callerId ? 'owner' : 'participant';
    const otherUser =
      role === 'owner'
        ? chat.participant
        : this.applySellerPhoneVisibility(chat, callerId);
    const myLastReadAt =
      role === 'owner' ? chat.ownerLastReadAt : chat.participantLastReadAt;
    const post = resolveImageUrls(this.storageService, chat.post);

    return {
      id: chat.id,
      createdAt: chat.createdAt,
      lastMessageAt: chat.lastMessageAt,
      post: {
        id: post.id,
        title: post.title,
        price: post.price,
        status: post.status,
        images: post.images,
      },
      otherUser,
      lastMessage: chat.messages[0] ?? null,
      myLastReadAt,
    };
  }

  /**
   * Only reached when the caller is this chat's `participant` (the
   * potential buyer), viewing `chat.post.owner` (the seller) as
   * `otherUser`. Strips `owner.phone` unless this chat is the post's
   * `reservedChat` and the post is `RESERVED`/`COMPLETED` — the
   * Reservation phone-visibility rule (Phase 11, `canViewSellerPhone()`).
   * The reverse direction (owner viewing the participant) never includes
   * a `phone` field at all — `chat.participant`'s select deliberately
   * doesn't select it, since no document describes a seller-sees-buyer's-
   * phone rule.
   */
  private applySellerPhoneVisibility(chat: ChatSummaryRow, callerId: string) {
    const reservedChatParticipantId =
      chat.post.reservedChatId === chat.id ? chat.participantId : null;
    const canSeePhone = canViewSellerPhone(
      chat.post,
      reservedChatParticipantId,
      callerId,
    );

    const owner = { ...chat.post.owner };
    if (!canSeePhone) {
      delete (owner as { phone?: string }).phone;
    }

    return owner;
  }

  /** Bounded (`page limit` many, never unbounded) per-row `count()` calls —
   * each row's unread threshold is that row's *own* watermark, which can't
   * be expressed as a single nested Prisma `include` filter. Acceptable at
   * MVP scale (≤ `limit`, indexed by `[chatId, createdAt]`); worth
   * revisiting with a single raw-SQL aggregate only if this shows up in
   * real performance data. */
  private async attachUnreadCounts<
    T extends { id: string; myLastReadAt: Date | null },
  >(summaries: T[], callerId: string) {
    const counts = await Promise.all(
      summaries.map((summary) =>
        this.prisma.message.count({
          where: {
            chatId: summary.id,
            senderId: { not: callerId },
            ...(summary.myLastReadAt
              ? { createdAt: { gt: summary.myLastReadAt } }
              : {}),
          },
        }),
      ),
    );

    return summaries.map((summary, index) => ({
      ...summary,
      unreadCount: counts[index],
    }));
  }
}
