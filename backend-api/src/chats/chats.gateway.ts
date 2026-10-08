import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { UsersService } from '../users/users.service';

interface AccessTokenPayload {
  sub: string;
}

export interface ChatMessageEventPayload {
  id: string;
  chatId: string;
  senderId: string;
  content: string;
  createdAt: Date;
}

export interface ChatReadEventPayload {
  chatId: string;
  readByUserId: string;
  readAt: Date;
}

/** Every authenticated socket joins exactly one room, keyed by user id —
 * not one room per chat. This is deliberately the *only* room concept in
 * the realtime layer (Step 2 architecture audit): it's sufficient for both
 * "live update an open chat thread" and "live update the unread badge on
 * the chat list while no thread is open" with a single join per
 * connection, and a user with multiple devices/tabs simply has multiple
 * sockets in the same room — no extra fan-out logic needed. Per-chat rooms
 * would add a subscribe/unsubscribe protocol for no requirement MVP scope
 * actually has (no typing indicators, no presence). */
function userRoom(userId: string): string {
  return `user:${userId}`;
}

/**
 * Realtime push layer for Chat (Phase 10 Step 2). REST remains the only
 * write path and the only source of truth (Technical/API Constitution —
 * Chat's REST operations are unchanged by this gateway) — this gateway
 * never receives business events from clients, it only *emits* `message:new`
 * / `chat:read` after `ChatsService` has already committed the
 * corresponding REST mutation. There is intentionally no message replay or
 * reconnect state here: a client that missed events while disconnected
 * catches up through the existing cursor-paginated REST endpoints
 * (`GET /chats`, `GET /chats/:chatId/messages`), per the approved Step 2
 * scope.
 *
 * Single Socket.IO instance, no adapter/pub-sub layer — the Technical
 * Constitution's Architecture Restrictions prohibit Redis at MVP, and the
 * app is a single-process modular monolith (§2), so the in-memory default
 * is both sufficient and the only option consistent with the Constitution.
 */
@WebSocketGateway()
export class ChatsGateway implements OnGatewayConnection {
  private readonly logger = new Logger(ChatsGateway.name);

  @WebSocketServer()
  private readonly server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * Handshake-time authentication — the existing `JwtStrategy`
   * (`passport-jwt`, `ExtractJwt.fromAuthHeaderAsBearerToken()`) is
   * Express/HTTP-coupled and doesn't apply to a socket handshake, so this
   * performs the same two steps (`JwtService.verifyAsync` +
   * `UsersService.findById`) directly. The token travels in Socket.IO's
   * standard `handshake.auth.token` field (the documented mechanism for
   * sending credentials), not squeezed into a header. Any failure —
   * missing token, invalid/expired token, or a token for a user that no
   * longer exists — disconnects the socket; there are no other inbound
   * events for a client to guard.
   */
  async handleConnection(client: Socket): Promise<void> {
    const token = this.extractToken(client);

    if (!token) {
      client.disconnect(true);
      return;
    }

    try {
      const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(
        token,
        { secret: process.env.JWT_SECRET },
      );
      const user = await this.usersService.findById(payload.sub);

      if (!user) {
        client.disconnect(true);
        return;
      }

      await client.join(userRoom(user.id));
    } catch (error) {
      this.logger.debug(
        `Rejected socket connection: ${(error as Error).message}`,
      );
      client.disconnect(true);
    }
  }

  /** Called by `ChatsService.appendMessage()` after the message and the
   * chat's `lastMessageAt` bump have both already committed via REST. */
  notifyNewMessage(
    participantUserIds: readonly string[],
    message: ChatMessageEventPayload,
  ): void {
    this.emitToUsers(participantUserIds, 'message:new', message);
  }

  /** Called by `ChatsService.markRead()` after the read watermark has
   * already committed via REST. */
  notifyRead(
    participantUserIds: readonly string[],
    payload: ChatReadEventPayload,
  ): void {
    this.emitToUsers(participantUserIds, 'chat:read', payload);
  }

  private extractToken(client: Socket): string | undefined {
    const token = client.handshake.auth?.token as unknown;
    return typeof token === 'string' && token.length > 0 ? token : undefined;
  }

  /** Best-effort only, by design: a realtime push failure must never fail
   * the REST mutation that already succeeded. Errors are logged, not
   * thrown. */
  private emitToUsers(
    userIds: readonly string[],
    event: string,
    payload: unknown,
  ): void {
    try {
      const rooms = userIds.map(userRoom);
      this.server.to(rooms).emit(event, payload);
    } catch (error) {
      this.logger.warn(
        `Failed to emit "${event}" to ${userIds.length} user(s): ${(error as Error).message}`,
      );
    }
  }
}
