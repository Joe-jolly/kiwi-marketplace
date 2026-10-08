import { randomUUID } from 'node:crypto';
import type { Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Test, TestingModule } from '@nestjs/testing';
import { PostStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { io, Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const E2E_DATABASE_URL =
  process.env.RESERVATION_REALTIME_E2E_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgresql://kiwi:kiwi_dev_password@localhost:5433/kiwi_marketplace?schema=public';

// Same reasoning as `chats-realtime.e2e-spec.ts`: a real `socket.io-client`
// connection needs an actual bound port, and real sockets alongside the
// rest of the e2e suite's DB load can occasionally need more than Jest's
// 5s default.
jest.setTimeout(15000);

// See `chats-realtime.e2e-spec.ts`'s identical constant: bumped from the
// original 5000ms because the full e2e suite now runs more concurrent
// real-socket connections (this file plus `chats-realtime.e2e-spec.ts`),
// which can occasionally push a fine-but-slower round trip past a tight
// threshold under load.
const WAIT_TIMEOUT_MS = 10000;

describe('Phase 11 Reservation — Socket.IO realtime (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let baseUrl: string;

  let categoryId: string;
  let ownerToken: string;
  let ownerId: string;
  let buyerToken: string;
  let strangerToken: string;

  const ISOLATED_LOCATION = { latitude: 35.6895, longitude: 139.6917 };

  beforeAll(async () => {
    process.env.DATABASE_URL = E2E_DATABASE_URL;
    process.env.JWT_SECRET =
      process.env.JWT_SECRET ?? 'reservation-realtime-e2e-secret';

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
      data: { name: '__reservation_rt_e2e_cat__', schema: {} },
    });
    categoryId = category.id;

    const passwordHash = await bcrypt.hash('password123', 10);

    const owner = await prisma.user.create({
      data: {
        phone: '__reservation_rt_owner__',
        passwordHash,
        displayName: 'RT Owner',
      },
    });
    ownerId = owner.id;

    await prisma.user.create({
      data: {
        phone: '__reservation_rt_buyer__',
        passwordHash,
        displayName: 'RT Buyer',
      },
    });

    await prisma.user.create({
      data: {
        phone: '__reservation_rt_stranger__',
        passwordHash,
        displayName: 'RT Stranger',
      },
    });

    ownerToken = await loginAs('__reservation_rt_owner__');
    buyerToken = await loginAs('__reservation_rt_buyer__');
    strangerToken = await loginAs('__reservation_rt_stranger__');
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
        chat: { post: { category: { name: '__reservation_rt_e2e_cat__' } } },
      },
    });
    await prisma.chat.deleteMany({
      where: { post: { category: { name: '__reservation_rt_e2e_cat__' } } },
    });
    await prisma.postImage.deleteMany({
      where: { post: { category: { name: '__reservation_rt_e2e_cat__' } } },
    });
    await prisma.post.deleteMany({
      where: { category: { name: '__reservation_rt_e2e_cat__' } },
    });
    await prisma.category.deleteMany({
      where: { name: '__reservation_rt_e2e_cat__' },
    });
    await prisma.user.deleteMany({
      where: {
        phone: {
          in: [
            '__reservation_rt_owner__',
            '__reservation_rt_buyer__',
            '__reservation_rt_stranger__',
          ],
        },
      },
    });
  }

  function createPostBody(overrides: Record<string, unknown> = {}) {
    return {
      categoryId,
      title: 'RT reservation post',
      price: 1000,
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
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ content })
      .expect(201);

    return response.body as { chatId: string };
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
      }, WAIT_TIMEOUT_MS);

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
      }, WAIT_TIMEOUT_MS);

      socket.once('connect', () => {
        clearTimeout(timer);
        // Small grace period: the client's `connect` event fires once the
        // transport handshake completes, which can race slightly ahead of
        // the server's own async `handleConnection` (JWT verify + user
        // lookup + `client.join(...)`) finishing — more likely to show up
        // under heavier concurrent load. Without this, a request issued
        // immediately after `connect` can occasionally reach the server
        // before the socket has actually joined its room, silently
        // missing a broadcast. This is a test-timing fix only; Socket.IO
        // itself has no delivery guarantee, by design.
        setTimeout(resolve, 150);
      });
      socket.connect();
    });
  }

  describe('post:status-changed', () => {
    it('is delivered to both the owner and the selected buyer when the post is reserved', async () => {
      const post = await createOwnedPost();
      const chat = await startChat(post.id);

      const ownerSocket = connectSocket(ownerToken);
      const buyerSocket = connectSocket(buyerToken);
      await Promise.all([
        waitForConnect(ownerSocket),
        waitForConnect(buyerSocket),
      ]);

      const ownerReceived = waitForEvent<{
        postId: string;
        status: PostStatus;
        reservedChatId: string | null;
      }>(ownerSocket, 'post:status-changed');
      const buyerReceived = waitForEvent<{
        postId: string;
        status: PostStatus;
        reservedChatId: string | null;
      }>(buyerSocket, 'post:status-changed');

      await request(app.getHttpServer())
        .post(`/posts/${post.id}/reservation`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ chatId: chat.chatId })
        .expect(201);

      const [ownerEvent, buyerEvent] = await Promise.all([
        ownerReceived,
        buyerReceived,
      ]);

      expect(ownerEvent.postId).toBe(post.id);
      expect(ownerEvent.status).toBe(PostStatus.RESERVED);
      expect(ownerEvent.reservedChatId).toBe(chat.chatId);
      expect(buyerEvent).toEqual(ownerEvent);

      ownerSocket.disconnect();
      buyerSocket.disconnect();
    });

    it('is delivered to both sides when the post is completed', async () => {
      const post = await createOwnedPost();
      const chat = await startChat(post.id);
      await request(app.getHttpServer())
        .post(`/posts/${post.id}/reservation`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ chatId: chat.chatId })
        .expect(201);

      const ownerSocket = connectSocket(ownerToken);
      const buyerSocket = connectSocket(buyerToken);
      await Promise.all([
        waitForConnect(ownerSocket),
        waitForConnect(buyerSocket),
      ]);

      const ownerReceived = waitForEvent<{
        postId: string;
        status: PostStatus;
      }>(ownerSocket, 'post:status-changed');
      const buyerReceived = waitForEvent<{
        postId: string;
        status: PostStatus;
      }>(buyerSocket, 'post:status-changed');

      await request(app.getHttpServer())
        .post(`/posts/${post.id}/completion`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send()
        .expect(201);

      const [ownerEvent, buyerEvent] = await Promise.all([
        ownerReceived,
        buyerReceived,
      ]);
      expect(ownerEvent.status).toBe(PostStatus.COMPLETED);
      expect(buyerEvent).toEqual(ownerEvent);

      ownerSocket.disconnect();
      buyerSocket.disconnect();
    });

    it('is not delivered to a stranger uninvolved in the reservation', async () => {
      const post = await createOwnedPost();
      const chat = await startChat(post.id);

      const strangerSocket = connectSocket(strangerToken);
      await waitForConnect(strangerSocket);

      let strangerReceivedSomething = false;
      strangerSocket.once('post:status-changed', () => {
        strangerReceivedSomething = true;
      });

      await request(app.getHttpServer())
        .post(`/posts/${post.id}/reservation`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ chatId: chat.chatId })
        .expect(201);

      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(strangerReceivedSomething).toBe(false);

      strangerSocket.disconnect();
    });
  });
});
