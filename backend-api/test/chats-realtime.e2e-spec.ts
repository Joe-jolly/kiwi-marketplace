import { randomUUID } from 'node:crypto';
import type { Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { io, Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const E2E_DATABASE_URL =
  process.env.CHATS_REALTIME_E2E_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgresql://kiwi:kiwi_dev_password@localhost:5433/kiwi_marketplace?schema=public';

// Every other e2e spec in this repo drives the app via
// `supertest(app.getHttpServer())`, which never binds a real port — fine
// for plain HTTP, but a real `socket.io-client` connection needs an
// actual listening TCP port. This suite is the first to call
// `app.listen(0)` (an OS-assigned free port) for that reason.
// Real network sockets, run alongside every other e2e suite's DB load —
// give this file more headroom than Jest's 5s default so a slow-but-fine
// round trip under concurrent load doesn't get mistaken for a real hang.
jest.setTimeout(15000);

describe('Phase 10 Chat — Socket.IO realtime (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let baseUrl: string;

  let categoryId: string;
  let ownerToken: string;
  let ownerId: string;
  let participantToken: string;
  let strangerToken: string;

  // Seoul — distinct from the other e2e suites' seeded coordinates
  // (Favorites uses Cape Town, Chat REST uses London).
  const ISOLATED_LOCATION = { latitude: 37.5665, longitude: 126.978 };

  beforeAll(async () => {
    process.env.DATABASE_URL = E2E_DATABASE_URL;
    process.env.JWT_SECRET =
      process.env.JWT_SECRET ?? 'chats-realtime-e2e-secret';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useWebSocketAdapter(new IoAdapter(app));
    await app.listen(0);

    const httpServer = app.getHttpServer() as unknown as HttpServer;
    const address = httpServer.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;

    prisma = app.get(PrismaService);
    await cleanup();

    const category = await prisma.category.create({
      data: { name: '__chats_realtime_e2e_cat__', schema: {} },
    });
    categoryId = category.id;

    const passwordHash = await bcrypt.hash('password123', 10);

    const owner = await prisma.user.create({
      data: {
        phone: '__chats_rt_owner__',
        passwordHash,
        displayName: 'RT Owner',
      },
    });
    ownerId = owner.id;

    await prisma.user.create({
      data: {
        phone: '__chats_rt_participant__',
        passwordHash,
        displayName: 'RT Participant',
      },
    });

    await prisma.user.create({
      data: {
        phone: '__chats_rt_stranger__',
        passwordHash,
        displayName: 'RT Stranger',
      },
    });

    ownerToken = await loginAs('__chats_rt_owner__');
    participantToken = await loginAs('__chats_rt_participant__');
    strangerToken = await loginAs('__chats_rt_stranger__');
  });

  async function loginAs(phone: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ phone, password: 'password123' })
      .expect(200);

    return (response.body as { accessToken: string }).accessToken;
  }

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  async function cleanup() {
    if (!prisma) return;

    await prisma.message.deleteMany({
      where: {
        chat: { post: { category: { name: '__chats_realtime_e2e_cat__' } } },
      },
    });
    await prisma.chat.deleteMany({
      where: { post: { category: { name: '__chats_realtime_e2e_cat__' } } },
    });
    await prisma.postImage.deleteMany({
      where: { post: { category: { name: '__chats_realtime_e2e_cat__' } } },
    });
    await prisma.post.deleteMany({
      where: { category: { name: '__chats_realtime_e2e_cat__' } },
    });
    await prisma.category.deleteMany({
      where: { name: '__chats_realtime_e2e_cat__' },
    });
    await prisma.user.deleteMany({
      where: {
        phone: {
          in: [
            '__chats_rt_owner__',
            '__chats_rt_participant__',
            '__chats_rt_stranger__',
          ],
        },
      },
    });
  }

  function createPostBody(overrides: Record<string, unknown> = {}) {
    return {
      categoryId,
      title: 'Realtime chat post',
      price: 500,
      description: 'desc',
      details: {},
      latitude: ISOLATED_LOCATION.latitude,
      longitude: ISOLATED_LOCATION.longitude,
      imageKeys: [`posts/${ownerId}/${randomUUID()}.webp`],
      ...overrides,
    };
  }

  async function createOwnedPost() {
    const response = await request(app.getHttpServer())
      .post('/posts')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send(createPostBody())
      .expect(201);

    return response.body as { id: string };
  }

  async function startChat(postId: string, content = 'Hi there') {
    const response = await request(app.getHttpServer())
      .post(`/posts/${postId}/messages`)
      .set('Authorization', `Bearer ${participantToken}`)
      .send({ content })
      .expect(201);

    return response.body as { id: string; chatId: string };
  }

  function connectSocket(token?: string): Socket {
    return io(baseUrl, {
      autoConnect: false,
      transports: ['websocket'],
      ...(token === undefined ? {} : { auth: { token } }),
      forceNew: true,
    });
  }

  function waitForEvent<T>(socket: Socket, event: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timed out waiting for "${event}"`));
      }, 5000);

      socket.once(event, (payload: T) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });
  }

  function waitForConnect(socket: Socket): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Timed out waiting to connect'));
      }, 5000);

      socket.once('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      socket.connect();
    });
  }

  // A failed handshake auth check happens inside `handleConnection`, *after*
  // the Socket.IO transport-level connection already succeeded — so a
  // rejected client observes `connect` immediately followed by a
  // server-initiated `disconnect`, not a transport-level `connect_error`
  // (which only fires for handshake/`allowRequest` failures, a stricter and
  // more complex mechanism this MVP-scope design deliberately doesn't use).
  function waitForDisconnect(socket: Socket): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Timed out waiting for disconnect'));
      }, 5000);

      socket.once('disconnect', (reason: string) => {
        clearTimeout(timer);
        resolve(reason);
      });
      socket.connect();
    });
  }

  describe('connection authentication', () => {
    it('accepts a connection with a valid access token', async () => {
      const socket = connectSocket(participantToken);
      await waitForConnect(socket);
      expect(socket.connected).toBe(true);
      socket.disconnect();
    });

    it('rejects a connection with no token', async () => {
      const socket = connectSocket(undefined);
      const reason = await waitForDisconnect(socket);
      expect(reason).toBeDefined();
      socket.disconnect();
    });

    it('rejects a connection with an invalid token', async () => {
      const socket = connectSocket('not-a-real-token');
      const reason = await waitForDisconnect(socket);
      expect(reason).toBeDefined();
      socket.disconnect();
    });
  });

  describe('message:new', () => {
    it('is delivered to both the owner and the participant when either side sends a message', async () => {
      const post = await createOwnedPost();
      const first = await startChat(post.id, 'First message');

      const ownerSocket = connectSocket(ownerToken);
      const participantSocket = connectSocket(participantToken);
      await Promise.all([
        waitForConnect(ownerSocket),
        waitForConnect(participantSocket),
      ]);

      const ownerReceived = waitForEvent<{
        chatId: string;
        content: string;
        senderId: string;
      }>(ownerSocket, 'message:new');
      const participantReceived = waitForEvent<{
        chatId: string;
        content: string;
        senderId: string;
      }>(participantSocket, 'message:new');

      await request(app.getHttpServer())
        .post(`/chats/${first.chatId}/messages`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ content: 'Reply from owner' })
        .expect(201);

      const [ownerEvent, participantEvent] = await Promise.all([
        ownerReceived,
        participantReceived,
      ]);

      expect(ownerEvent.chatId).toBe(first.chatId);
      expect(ownerEvent.content).toBe('Reply from owner');
      expect(ownerEvent.senderId).toBe(ownerId);
      expect(participantEvent).toEqual(ownerEvent);

      ownerSocket.disconnect();
      participantSocket.disconnect();
    });

    it('is not delivered to a stranger who is not part of the chat', async () => {
      const post = await createOwnedPost();
      const first = await startChat(post.id, 'Another message');

      const strangerSocket = connectSocket(strangerToken);
      await waitForConnect(strangerSocket);

      let strangerReceivedSomething = false;
      strangerSocket.once('message:new', () => {
        strangerReceivedSomething = true;
      });

      await request(app.getHttpServer())
        .post(`/chats/${first.chatId}/messages`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ content: 'Not for the stranger' })
        .expect(201);

      // Give the (absent) event a moment to arrive if it incorrectly were sent.
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(strangerReceivedSomething).toBe(false);

      strangerSocket.disconnect();
    });
  });

  describe('chat:read', () => {
    it('is delivered to both sides when a participant advances their read watermark', async () => {
      const post = await createOwnedPost();
      const first = await startChat(post.id, 'Read receipt test');

      const ownerSocket = connectSocket(ownerToken);
      const participantSocket = connectSocket(participantToken);
      await Promise.all([
        waitForConnect(ownerSocket),
        waitForConnect(participantSocket),
      ]);

      const ownerReceived = waitForEvent<{
        chatId: string;
        readByUserId: string;
      }>(ownerSocket, 'chat:read');
      const participantReceived = waitForEvent<{
        chatId: string;
        readByUserId: string;
      }>(participantSocket, 'chat:read');

      await request(app.getHttpServer())
        .post(`/chats/${first.chatId}/reads`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(204);

      const [ownerEvent, participantEvent] = await Promise.all([
        ownerReceived,
        participantReceived,
      ]);

      expect(ownerEvent.chatId).toBe(first.chatId);
      expect(ownerEvent.readByUserId).toBe(ownerId);
      expect(participantEvent).toEqual(ownerEvent);

      ownerSocket.disconnect();
      participantSocket.disconnect();
    });
  });
});
