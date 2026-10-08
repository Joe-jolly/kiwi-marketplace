import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PostStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { encodeKeysetCursor } from '../src/common/pagination/keyset-cursor.util';
import { PrismaService } from '../src/prisma/prisma.service';

const E2E_DATABASE_URL =
  process.env.CHATS_E2E_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgresql://kiwi:kiwi_dev_password@localhost:5433/kiwi_marketplace?schema=public';

describe('Phase 10 Chat (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let categoryId: string;
  let ownerToken: string;
  let ownerId: string;
  let participantToken: string;
  let participantId: string;
  let strangerToken: string;

  // London — distinct from the other e2e suites' seeded coordinates
  // (Favorites uses Cape Town; see that suite's comment for the full
  // list); this suite never runs a location-scoped feed query, but its
  // ACTIVE test posts still exist in the shared table while other suites
  // may run concurrently.
  const ISOLATED_LOCATION = { latitude: 51.5072, longitude: -0.1276 };

  beforeAll(async () => {
    process.env.DATABASE_URL = E2E_DATABASE_URL;
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'chats-e2e-secret';

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
    await app.init();

    prisma = app.get(PrismaService);
    await cleanup();

    const category = await prisma.category.create({
      data: { name: '__chats_e2e_cat__', schema: {} },
    });
    categoryId = category.id;

    const passwordHash = await bcrypt.hash('password123', 10);

    const owner = await prisma.user.create({
      data: {
        phone: '__chats_owner__',
        passwordHash,
        displayName: 'Owner',
      },
    });
    ownerId = owner.id;

    const participant = await prisma.user.create({
      data: {
        phone: '__chats_participant__',
        passwordHash,
        displayName: 'Participant',
      },
    });
    participantId = participant.id;

    const stranger = await prisma.user.create({
      data: {
        phone: '__chats_stranger__',
        passwordHash,
        displayName: 'Stranger',
      },
    });

    ownerToken = await loginAs('__chats_owner__');
    participantToken = await loginAs('__chats_participant__');
    strangerToken = await loginAs('__chats_stranger__');
    void stranger;
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
      where: { chat: { post: { category: { name: '__chats_e2e_cat__' } } } },
    });
    await prisma.chat.deleteMany({
      where: { post: { category: { name: '__chats_e2e_cat__' } } },
    });
    await prisma.postImage.deleteMany({
      where: { post: { category: { name: '__chats_e2e_cat__' } } },
    });
    await prisma.post.deleteMany({
      where: { category: { name: '__chats_e2e_cat__' } },
    });
    await prisma.category.deleteMany({
      where: { name: '__chats_e2e_cat__' },
    });
    await prisma.user.deleteMany({
      where: {
        phone: {
          in: [
            '__chats_owner__',
            '__chats_participant__',
            '__chats_stranger__',
          ],
        },
      },
    });
  }

  function createPostBody(overrides: Record<string, unknown> = {}) {
    return {
      categoryId,
      title: 'Chat post',
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

  async function startChat(postId: string, content = 'Hi, is this available?') {
    const response = await request(app.getHttpServer())
      .post(`/posts/${postId}/messages`)
      .set('Authorization', `Bearer ${participantToken}`)
      .send({ content })
      .expect(201);

    return response.body as {
      id: string;
      chatId: string;
      senderId: string;
      content: string;
      createdAt: string;
    };
  }

  describe('POST /posts/:postId/messages', () => {
    it('creates a chat and sends the first message', async () => {
      const post = await createOwnedPost();

      const message = await startChat(post.id, 'Hi there');

      expect(message.chatId).toBeDefined();
      expect(message.senderId).toBe(participantId);
      expect(message.content).toBe('Hi there');

      const chat = await prisma.chat.findUnique({
        where: { id: message.chatId },
      });
      expect(chat).not.toBeNull();
      expect(chat?.postId).toBe(post.id);
      expect(chat?.participantId).toBe(participantId);
    });

    it('reuses the existing chat instead of creating a duplicate', async () => {
      const post = await createOwnedPost();

      const first = await startChat(post.id, 'First');
      const second = await startChat(post.id, 'Second');

      expect(second.chatId).toBe(first.chatId);

      const count = await prisma.chat.count({
        where: { postId: post.id, participantId },
      });
      expect(count).toBe(1);
    });

    it('rejects the post owner starting a chat with themselves', async () => {
      const post = await createOwnedPost();

      await request(app.getHttpServer())
        .post(`/posts/${post.id}/messages`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ content: 'hi me' })
        .expect(403);
    });

    it('404s for a nonexistent post', async () => {
      await request(app.getHttpServer())
        .post(`/posts/${randomUUID()}/messages`)
        .set('Authorization', `Bearer ${participantToken}`)
        .send({ content: 'hi' })
        .expect(404);
    });

    it('404s for a PAUSED post', async () => {
      const post = await createOwnedPost();
      await prisma.post.update({
        where: { id: post.id },
        data: { status: PostStatus.PAUSED },
      });

      await request(app.getHttpServer())
        .post(`/posts/${post.id}/messages`)
        .set('Authorization', `Bearer ${participantToken}`)
        .send({ content: 'hi' })
        .expect(404);
    });

    it('409s starting a *new* chat on a COMPLETED post', async () => {
      const post = await createOwnedPost();
      await prisma.post.update({
        where: { id: post.id },
        data: { status: PostStatus.COMPLETED },
      });

      await request(app.getHttpServer())
        .post(`/posts/${post.id}/messages`)
        .set('Authorization', `Bearer ${participantToken}`)
        .send({ content: 'hi' })
        .expect(409);
    });

    it('allows an existing chat to keep receiving messages after the post completes', async () => {
      const post = await createOwnedPost();
      const first = await startChat(post.id, 'Before completion');

      await prisma.post.update({
        where: { id: post.id },
        data: { status: PostStatus.COMPLETED },
      });

      const second = await startChat(post.id, 'After completion');
      expect(second.chatId).toBe(first.chatId);
    });

    it('rejects an empty message body', async () => {
      const post = await createOwnedPost();

      await request(app.getHttpServer())
        .post(`/posts/${post.id}/messages`)
        .set('Authorization', `Bearer ${participantToken}`)
        .send({ content: '' })
        .expect(400);
    });

    it('rejects unauthenticated requests', async () => {
      const post = await createOwnedPost();

      await request(app.getHttpServer())
        .post(`/posts/${post.id}/messages`)
        .send({ content: 'hi' })
        .expect(401);
    });
  });

  describe('POST /chats/:chatId/messages', () => {
    it('allows the owner to reply on an existing chat', async () => {
      const post = await createOwnedPost();
      const first = await startChat(post.id);

      const response = await request(app.getHttpServer())
        .post(`/chats/${first.chatId}/messages`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ content: 'Yes, still available' })
        .expect(201);

      const body = response.body as { senderId: string; chatId: string };
      expect(body.senderId).toBe(ownerId);
      expect(body.chatId).toBe(first.chatId);
    });

    it('allows the participant to send another message', async () => {
      const post = await createOwnedPost();
      const first = await startChat(post.id);

      await request(app.getHttpServer())
        .post(`/chats/${first.chatId}/messages`)
        .set('Authorization', `Bearer ${participantToken}`)
        .send({ content: 'Following up' })
        .expect(201);
    });

    it('rejects a stranger who is neither side of the chat', async () => {
      const post = await createOwnedPost();
      const first = await startChat(post.id);

      await request(app.getHttpServer())
        .post(`/chats/${first.chatId}/messages`)
        .set('Authorization', `Bearer ${strangerToken}`)
        .send({ content: 'butting in' })
        .expect(403);
    });

    it('404s for a nonexistent chat', async () => {
      await request(app.getHttpServer())
        .post(`/chats/${randomUUID()}/messages`)
        .set('Authorization', `Bearer ${participantToken}`)
        .send({ content: 'hi' })
        .expect(404);
    });

    it('rejects unauthenticated requests', async () => {
      const post = await createOwnedPost();
      const first = await startChat(post.id);

      await request(app.getHttpServer())
        .post(`/chats/${first.chatId}/messages`)
        .send({ content: 'hi' })
        .expect(401);
    });
  });

  describe('GET /chats', () => {
    it('lists a chat for both the owner and the participant, most-recent-activity first', async () => {
      const postA = await createOwnedPost();
      const postB = await createOwnedPost();

      const chatA = await startChat(postA.id, 'chat A first message');
      const chatB = await startChat(postB.id, 'chat B first message');

      // Bump chat A's activity so it's the most recently active.
      await request(app.getHttpServer())
        .post(`/chats/${chatA.chatId}/messages`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ content: 'reply on A' })
        .expect(201);

      const asParticipant = await request(app.getHttpServer())
        .get('/chats')
        .set('Authorization', `Bearer ${participantToken}`)
        .query({ limit: 50 })
        .expect(200);

      const participantBody = asParticipant.body as {
        items: { id: string; otherUser: { id: string } }[];
      };
      const ids = participantBody.items.map((c) => c.id);
      expect(ids.indexOf(chatA.chatId)).toBeLessThan(ids.indexOf(chatB.chatId));
      const itemA = participantBody.items.find((c) => c.id === chatA.chatId);
      expect(itemA?.otherUser.id).toBe(ownerId);

      const asOwner = await request(app.getHttpServer())
        .get('/chats')
        .set('Authorization', `Bearer ${ownerToken}`)
        .query({ limit: 50 })
        .expect(200);

      const ownerBody = asOwner.body as {
        items: { id: string; otherUser: { id: string } }[];
      };
      const ownerItemA = ownerBody.items.find((c) => c.id === chatA.chatId);
      expect(ownerItemA?.otherUser.id).toBe(participantId);
    });

    it('tracks unreadCount per side and clears it via POST /chats/:chatId/reads', async () => {
      const post = await createOwnedPost();
      const first = await startChat(post.id, 'Hi');

      await request(app.getHttpServer())
        .post(`/chats/${first.chatId}/messages`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ content: 'Hello back' })
        .expect(201);

      const participantView = await request(app.getHttpServer())
        .get(`/chats/${first.chatId}`)
        .set('Authorization', `Bearer ${participantToken}`)
        .expect(200);
      expect(
        (participantView.body as { unreadCount: number }).unreadCount,
      ).toBe(1);

      const ownerView = await request(app.getHttpServer())
        .get(`/chats/${first.chatId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect((ownerView.body as { unreadCount: number }).unreadCount).toBe(1);

      await request(app.getHttpServer())
        .post(`/chats/${first.chatId}/reads`)
        .set('Authorization', `Bearer ${participantToken}`)
        .expect(204);

      const participantViewAfterRead = await request(app.getHttpServer())
        .get(`/chats/${first.chatId}`)
        .set('Authorization', `Bearer ${participantToken}`)
        .expect(200);
      expect(
        (participantViewAfterRead.body as { unreadCount: number }).unreadCount,
      ).toBe(0);

      // Owner hasn't read yet — still 1.
      const ownerViewStill = await request(app.getHttpServer())
        .get(`/chats/${first.chatId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect((ownerViewStill.body as { unreadCount: number }).unreadCount).toBe(
        1,
      );
    });

    it('is cursor-paginated (lastMessageAt desc, id desc)', async () => {
      const postA = await createOwnedPost();
      const postB = await createOwnedPost();
      const postC = await createOwnedPost();

      const a = await startChat(postA.id);
      const b = await startChat(postB.id);
      const c = await startChat(postC.id);

      const page1 = await request(app.getHttpServer())
        .get('/chats')
        .set('Authorization', `Bearer ${participantToken}`)
        .query({ limit: 2 })
        .expect(200);

      const body1 = page1.body as {
        items: { id: string }[];
        nextCursor: string | null;
        hasNextPage: boolean;
      };
      expect(body1.items.map((i) => i.id)).toEqual([c.chatId, b.chatId]);
      expect(body1.hasNextPage).toBe(true);

      const page2 = await request(app.getHttpServer())
        .get('/chats')
        .set('Authorization', `Bearer ${participantToken}`)
        .query({ limit: 2, cursor: body1.nextCursor })
        .expect(200);

      const body2 = page2.body as { items: { id: string }[] };
      expect(body2.items[0]?.id).toBe(a.chatId);
    });

    it('rejects a cursor issued for a different endpoint (purpose-scoped)', async () => {
      const wrongScopeCursor = encodeKeysetCursor(
        'favorites-mine',
        new Date(),
        randomUUID(),
      );

      await request(app.getHttpServer())
        .get('/chats')
        .set('Authorization', `Bearer ${participantToken}`)
        .query({ cursor: wrongScopeCursor })
        .expect(400);
    });

    it('rejects unauthenticated requests', async () => {
      await request(app.getHttpServer()).get('/chats').expect(401);
    });
  });

  describe('GET /chats/:chatId', () => {
    it('403s for a stranger who is neither side of the chat', async () => {
      const post = await createOwnedPost();
      const first = await startChat(post.id);

      await request(app.getHttpServer())
        .get(`/chats/${first.chatId}`)
        .set('Authorization', `Bearer ${strangerToken}`)
        .expect(403);
    });

    it('404s for a nonexistent chat', async () => {
      await request(app.getHttpServer())
        .get(`/chats/${randomUUID()}`)
        .set('Authorization', `Bearer ${participantToken}`)
        .expect(404);
    });
  });

  describe('GET /chats/:chatId/messages', () => {
    it('lists messages newest-first', async () => {
      const post = await createOwnedPost();
      const first = await startChat(post.id, 'msg1');
      await request(app.getHttpServer())
        .post(`/chats/${first.chatId}/messages`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ content: 'msg2' })
        .expect(201);

      const response = await request(app.getHttpServer())
        .get(`/chats/${first.chatId}/messages`)
        .set('Authorization', `Bearer ${participantToken}`)
        .query({ limit: 50 })
        .expect(200);

      const body = response.body as { items: { content: string }[] };
      expect(body.items.map((m) => m.content)).toEqual(['msg2', 'msg1']);
    });

    it('is cursor-paginated (createdAt desc, id desc)', async () => {
      const post = await createOwnedPost();
      const first = await startChat(post.id, 'm1');
      await request(app.getHttpServer())
        .post(`/chats/${first.chatId}/messages`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ content: 'm2' })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/chats/${first.chatId}/messages`)
        .set('Authorization', `Bearer ${participantToken}`)
        .send({ content: 'm3' })
        .expect(201);

      const page1 = await request(app.getHttpServer())
        .get(`/chats/${first.chatId}/messages`)
        .set('Authorization', `Bearer ${participantToken}`)
        .query({ limit: 2 })
        .expect(200);

      const body1 = page1.body as {
        items: { content: string }[];
        nextCursor: string | null;
        hasNextPage: boolean;
      };
      expect(body1.items.map((m) => m.content)).toEqual(['m3', 'm2']);
      expect(body1.hasNextPage).toBe(true);

      const page2 = await request(app.getHttpServer())
        .get(`/chats/${first.chatId}/messages`)
        .set('Authorization', `Bearer ${participantToken}`)
        .query({ limit: 2, cursor: body1.nextCursor })
        .expect(200);

      const body2 = page2.body as {
        items: { content: string }[];
        hasNextPage: boolean;
      };
      expect(body2.items).toEqual([expect.objectContaining({ content: 'm1' })]);
      expect(body2.hasNextPage).toBe(false);
    });

    it('403s for a stranger', async () => {
      const post = await createOwnedPost();
      const first = await startChat(post.id);

      await request(app.getHttpServer())
        .get(`/chats/${first.chatId}/messages`)
        .set('Authorization', `Bearer ${strangerToken}`)
        .expect(403);
    });

    it('404s for a nonexistent chat', async () => {
      await request(app.getHttpServer())
        .get(`/chats/${randomUUID()}/messages`)
        .set('Authorization', `Bearer ${participantToken}`)
        .expect(404);
    });

    it('rejects unauthenticated requests', async () => {
      const post = await createOwnedPost();
      const first = await startChat(post.id);

      await request(app.getHttpServer())
        .get(`/chats/${first.chatId}/messages`)
        .expect(401);
    });
  });

  describe('POST /chats/:chatId/reads', () => {
    it('403s for a stranger', async () => {
      const post = await createOwnedPost();
      const first = await startChat(post.id);

      await request(app.getHttpServer())
        .post(`/chats/${first.chatId}/reads`)
        .set('Authorization', `Bearer ${strangerToken}`)
        .expect(403);
    });

    it('404s for a nonexistent chat', async () => {
      await request(app.getHttpServer())
        .post(`/chats/${randomUUID()}/reads`)
        .set('Authorization', `Bearer ${participantToken}`)
        .expect(404);
    });

    it('rejects unauthenticated requests', async () => {
      const post = await createOwnedPost();
      const first = await startChat(post.id);

      await request(app.getHttpServer())
        .post(`/chats/${first.chatId}/reads`)
        .expect(401);
    });
  });

  describe('cascade delete', () => {
    it('hard-deleting a post removes its chats and messages', async () => {
      const post = await createOwnedPost();
      const first = await startChat(post.id);

      await prisma.post.delete({ where: { id: post.id } });

      const chat = await prisma.chat.findUnique({
        where: { id: first.chatId },
      });
      expect(chat).toBeNull();
      const messageCount = await prisma.message.count({
        where: { chatId: first.chatId },
      });
      expect(messageCount).toBe(0);
    });
  });
});
