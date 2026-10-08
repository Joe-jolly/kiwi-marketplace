import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PostStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const E2E_DATABASE_URL =
  process.env.RESERVATION_E2E_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgresql://kiwi:kiwi_dev_password@localhost:5433/kiwi_marketplace?schema=public';

describe('Phase 11 Reservation (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let categoryId: string;
  let ownerToken: string;
  let ownerId: string;
  let buyerToken: string;
  let buyerId: string;
  let otherBuyerToken: string;
  let strangerToken: string;

  // Tokyo — distinct from every other e2e suite's seeded coordinates (see
  // `chats.e2e-spec.ts` [London], `chats-realtime.e2e-spec.ts` /
  // `feed-v3-pagination.e2e-spec.ts` [~Seoul], `favorites.e2e-spec.ts`
  // [Cape Town], `feed-relevance-ranking.e2e-spec.ts` [~Sydney]). This
  // suite never runs a location-scoped feed query, so exact collision
  // would be harmless regardless, but a distinct point keeps intent clear.
  const ISOLATED_LOCATION = { latitude: 35.6762, longitude: 139.6503 };

  beforeAll(async () => {
    process.env.DATABASE_URL = E2E_DATABASE_URL;
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'reservation-e2e-secret';

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
      data: { name: '__reservation_e2e_cat__', schema: {} },
    });
    categoryId = category.id;

    const passwordHash = await bcrypt.hash('password123', 10);

    const owner = await prisma.user.create({
      data: {
        phone: '__reservation_owner__',
        passwordHash,
        displayName: 'Owner',
      },
    });
    ownerId = owner.id;

    const buyer = await prisma.user.create({
      data: {
        phone: '__reservation_buyer__',
        passwordHash,
        displayName: 'Buyer',
      },
    });
    buyerId = buyer.id;

    await prisma.user.create({
      data: {
        phone: '__reservation_other_buyer__',
        passwordHash,
        displayName: 'Other Buyer',
      },
    });

    await prisma.user.create({
      data: {
        phone: '__reservation_stranger__',
        passwordHash,
        displayName: 'Stranger',
      },
    });

    ownerToken = await loginAs('__reservation_owner__');
    buyerToken = await loginAs('__reservation_buyer__');
    otherBuyerToken = await loginAs('__reservation_other_buyer__');
    strangerToken = await loginAs('__reservation_stranger__');
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
        chat: { post: { category: { name: '__reservation_e2e_cat__' } } },
      },
    });
    await prisma.chat.deleteMany({
      where: { post: { category: { name: '__reservation_e2e_cat__' } } },
    });
    await prisma.postImage.deleteMany({
      where: { post: { category: { name: '__reservation_e2e_cat__' } } },
    });
    await prisma.post.deleteMany({
      where: { category: { name: '__reservation_e2e_cat__' } },
    });
    await prisma.category.deleteMany({
      where: { name: '__reservation_e2e_cat__' },
    });
    await prisma.user.deleteMany({
      where: {
        phone: {
          in: [
            '__reservation_owner__',
            '__reservation_buyer__',
            '__reservation_other_buyer__',
            '__reservation_stranger__',
          ],
        },
      },
    });
  }

  function createPostBody(overrides: Record<string, unknown> = {}) {
    return {
      categoryId,
      title: 'Reservation post',
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

  async function startChatAs(
    token: string,
    postId: string,
    content = 'Hi, is this available?',
  ) {
    const response = await request(app.getHttpServer())
      .post(`/posts/${postId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content })
      .expect(201);

    return response.body as { chatId: string };
  }

  // Deliberately *not* `async` — returning the raw supertest `Test` object
  // (not an awaited `Response`) preserves its chainable `.expect(...)`,
  // which every call site below relies on.
  function selectBuyer(postId: string, chatId: string, token = ownerToken) {
    return request(app.getHttpServer())
      .post(`/posts/${postId}/reservation`)
      .set('Authorization', `Bearer ${token}`)
      .send({ chatId });
  }

  function completeListing(postId: string, token = ownerToken) {
    return request(app.getHttpServer())
      .post(`/posts/${postId}/completion`)
      .set('Authorization', `Bearer ${token}`)
      .send();
  }

  describe('POST /posts/:id/reservation — Select Buyer / Reserve Listing', () => {
    it("reserves the post for the selected chat's participant", async () => {
      const post = await createOwnedPost();
      const chat = await startChatAs(buyerToken, post.id);

      const response = await selectBuyer(post.id, chat.chatId).expect(201);

      const body = response.body as {
        status: PostStatus;
        reservedChatId: string;
        reservedAt: string | null;
      };
      expect(body.status).toBe(PostStatus.RESERVED);
      expect(body.reservedChatId).toBe(chat.chatId);
      expect(body.reservedAt).not.toBeNull();

      const row = await prisma.post.findUniqueOrThrow({
        where: { id: post.id },
      });
      expect(row.status).toBe(PostStatus.RESERVED);
      expect(row.reservedChatId).toBe(chat.chatId);
      expect(row.reservedAt).not.toBeNull();

      // Verify persistent system notification was created for the buyer
      const notifications = await prisma.notification.findMany({
        where: { userId: buyerId, postId: post.id },
      });
      expect(notifications.length).toBe(1);
      expect(notifications[0].type).toBe('RESERVATION_CREATED');
      expect(notifications[0].isRead).toBe(false);
    });

    it('rejects a non-owner selecting a buyer', async () => {
      const post = await createOwnedPost();
      const chat = await startChatAs(buyerToken, post.id);

      await selectBuyer(post.id, chat.chatId, buyerToken).expect(403);
    });

    it('rejects unauthenticated requests', async () => {
      const post = await createOwnedPost();
      const chat = await startChatAs(buyerToken, post.id);

      await request(app.getHttpServer())
        .post(`/posts/${post.id}/reservation`)
        .send({ chatId: chat.chatId })
        .expect(401);
    });

    it('404s for a nonexistent post', async () => {
      const chat = await startChatAs(buyerToken, (await createOwnedPost()).id);

      await selectBuyer(randomUUID(), chat.chatId).expect(404);
    });

    it('404s for a nonexistent chatId', async () => {
      const post = await createOwnedPost();

      await selectBuyer(post.id, randomUUID()).expect(404);
    });

    it('404s for a chatId that belongs to a different post', async () => {
      const postA = await createOwnedPost();
      const postB = await createOwnedPost();
      const chatOnB = await startChatAs(buyerToken, postB.id);

      await selectBuyer(postA.id, chatOnB.chatId).expect(404);
    });

    it('409s selecting a buyer on an already-RESERVED post ("only one reservation per post")', async () => {
      const post = await createOwnedPost();
      const chat = await startChatAs(buyerToken, post.id);
      const otherChat = await startChatAs(otherBuyerToken, post.id);
      await selectBuyer(post.id, chat.chatId).expect(201);

      await selectBuyer(post.id, otherChat.chatId).expect(409);
    });

    it('409s selecting a buyer on a COMPLETED post', async () => {
      const post = await createOwnedPost();
      const chat = await startChatAs(buyerToken, post.id);
      // Started *before* completion — a brand-new chat couldn't be
      // started on a COMPLETED post at all (unchanged Phase 10 rule,
      // covered separately below), so this test needs a chat that
      // already existed beforehand to isolate the Reservation-specific
      // 409 (status !== ACTIVE) from that unrelated "no new chats" 409.
      const otherChat = await startChatAs(otherBuyerToken, post.id);
      await selectBuyer(post.id, chat.chatId).expect(201);
      await completeListing(post.id).expect(201);

      await selectBuyer(post.id, otherChat.chatId).expect(409);
    });

    it('does not disturb other, non-selected chats on the same post', async () => {
      const post = await createOwnedPost();
      const chat = await startChatAs(buyerToken, post.id);
      const otherChat = await startChatAs(otherBuyerToken, post.id);

      await selectBuyer(post.id, chat.chatId).expect(201);

      // The other buyer's chat remains fully open and writable — the
      // Database Constitution's "cannot accept new reservation" only
      // blocks re-reservation, not continued messaging on other chats.
      await request(app.getHttpServer())
        .post(`/chats/${otherChat.chatId}/messages`)
        .set('Authorization', `Bearer ${otherBuyerToken}`)
        .send({ content: 'still chatting' })
        .expect(201);
    });

    it('allows new chats to still be started on a RESERVED post (not blocked, only COMPLETED blocks new chats)', async () => {
      const post = await createOwnedPost();
      const chat = await startChatAs(buyerToken, post.id);
      await selectBuyer(post.id, chat.chatId).expect(201);

      await request(app.getHttpServer())
        .post(`/posts/${post.id}/messages`)
        .set('Authorization', `Bearer ${strangerToken}`)
        .send({ content: 'is this still available?' })
        .expect(201);
    });
  });

  describe('POST /posts/:id/completion — Complete Listing', () => {
    it('completes a RESERVED post', async () => {
      const post = await createOwnedPost();
      const chat = await startChatAs(buyerToken, post.id);
      await selectBuyer(post.id, chat.chatId).expect(201);

      const response = await completeListing(post.id).expect(201);

      const body = response.body as {
        status: PostStatus;
        completedAt: string | null;
      };
      expect(body.status).toBe(PostStatus.COMPLETED);
      expect(body.completedAt).not.toBeNull();
    });

    it('409s completing a post that was never reserved (ACTIVE -> COMPLETED directly is invalid)', async () => {
      const post = await createOwnedPost();

      await completeListing(post.id).expect(409);
    });

    it('409s completing an already-COMPLETED post', async () => {
      const post = await createOwnedPost();
      const chat = await startChatAs(buyerToken, post.id);
      await selectBuyer(post.id, chat.chatId).expect(201);
      await completeListing(post.id).expect(201);

      await completeListing(post.id).expect(409);
    });

    it('rejects a non-owner completing the listing', async () => {
      const post = await createOwnedPost();
      const chat = await startChatAs(buyerToken, post.id);
      await selectBuyer(post.id, chat.chatId).expect(201);

      await completeListing(post.id, buyerToken).expect(403);
    });

    it('rejects unauthenticated requests', async () => {
      const post = await createOwnedPost();

      await request(app.getHttpServer())
        .post(`/posts/${post.id}/completion`)
        .send()
        .expect(401);
    });

    it('404s for a nonexistent post', async () => {
      await completeListing(randomUUID()).expect(404);
    });

    it('existing chats remain fully writable after completion (Phase 10 behavior unchanged)', async () => {
      const post = await createOwnedPost();
      const chat = await startChatAs(buyerToken, post.id);
      await selectBuyer(post.id, chat.chatId).expect(201);
      await completeListing(post.id).expect(201);

      await request(app.getHttpServer())
        .post(`/chats/${chat.chatId}/messages`)
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ content: 'thanks!' })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/chats/${chat.chatId}/messages`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ content: 'np!' })
        .expect(201);
    });

    it('still blocks a brand-new chat being started on a COMPLETED post (Phase 10 behavior unchanged)', async () => {
      const post = await createOwnedPost();
      const chat = await startChatAs(buyerToken, post.id);
      await selectBuyer(post.id, chat.chatId).expect(201);
      await completeListing(post.id).expect(201);

      await request(app.getHttpServer())
        .post(`/posts/${post.id}/messages`)
        .set('Authorization', `Bearer ${strangerToken}`)
        .send({ content: 'too late?' })
        .expect(409);
    });
  });

  describe('Seller phone-number visibility', () => {
    it('does not expose the seller phone before any reservation (GET /posts/:id, GET /chats/:chatId)', async () => {
      const post = await createOwnedPost();
      const chat = await startChatAs(buyerToken, post.id);

      const postView = await request(app.getHttpServer())
        .get(`/posts/${post.id}`)
        .set('Authorization', `Bearer ${buyerToken}`)
        .expect(200);
      expect(
        (postView.body as { owner: { phone?: string } }).owner.phone,
      ).toBeUndefined();

      const chatView = await request(app.getHttpServer())
        .get(`/chats/${chat.chatId}`)
        .set('Authorization', `Bearer ${buyerToken}`)
        .expect(200);
      expect(
        (chatView.body as { otherUser: { phone?: string } }).otherUser.phone,
      ).toBeUndefined();
    });

    it('exposes the seller phone to the selected buyer once RESERVED, via both GET /posts/:id and GET /chats/:chatId', async () => {
      const post = await createOwnedPost();
      const chat = await startChatAs(buyerToken, post.id);
      await selectBuyer(post.id, chat.chatId).expect(201);

      const postView = await request(app.getHttpServer())
        .get(`/posts/${post.id}`)
        .set('Authorization', `Bearer ${buyerToken}`)
        .expect(200);
      expect((postView.body as { owner: { phone?: string } }).owner.phone).toBe(
        '__reservation_owner__',
      );

      const chatView = await request(app.getHttpServer())
        .get(`/chats/${chat.chatId}`)
        .set('Authorization', `Bearer ${buyerToken}`)
        .expect(200);
      expect(
        (chatView.body as { otherUser: { phone?: string } }).otherUser.phone,
      ).toBe('__reservation_owner__');
    });

    it('does not reveal the phone to a different, non-selected chat participant on the same post', async () => {
      const post = await createOwnedPost();
      const chat = await startChatAs(buyerToken, post.id);
      const otherChat = await startChatAs(otherBuyerToken, post.id);
      await selectBuyer(post.id, chat.chatId).expect(201);

      const otherChatView = await request(app.getHttpServer())
        .get(`/chats/${otherChat.chatId}`)
        .set('Authorization', `Bearer ${otherBuyerToken}`)
        .expect(200);
      expect(
        (otherChatView.body as { otherUser: { phone?: string } }).otherUser
          .phone,
      ).toBeUndefined();
    });

    it("does not reveal the buyer's phone to the seller (one-directional only)", async () => {
      const post = await createOwnedPost();
      const chat = await startChatAs(buyerToken, post.id);
      await selectBuyer(post.id, chat.chatId).expect(201);

      const ownerChatView = await request(app.getHttpServer())
        .get(`/chats/${chat.chatId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect(
        (ownerChatView.body as { otherUser: { phone?: string } }).otherUser
          .phone,
      ).toBeUndefined();
    });

    it("does not expose the phone field to the owner's own GET /posts/:id view", async () => {
      const post = await createOwnedPost();
      const chat = await startChatAs(buyerToken, post.id);
      await selectBuyer(post.id, chat.chatId).expect(201);

      const ownerView = await request(app.getHttpServer())
        .get(`/posts/${post.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect(
        (ownerView.body as { owner: { phone?: string } }).owner.phone,
      ).toBeUndefined();
    });

    it('keeps the phone visible to the selected buyer after the listing is COMPLETED', async () => {
      const post = await createOwnedPost();
      const chat = await startChatAs(buyerToken, post.id);
      await selectBuyer(post.id, chat.chatId).expect(201);
      await completeListing(post.id).expect(201);

      const postView = await request(app.getHttpServer())
        .get(`/posts/${post.id}`)
        .set('Authorization', `Bearer ${buyerToken}`)
        .expect(200);
      expect((postView.body as { owner: { phone?: string } }).owner.phone).toBe(
        '__reservation_owner__',
      );
    });

    it('never exposes a phone field on an anonymous (unauthenticated) GET /posts/:id view', async () => {
      const post = await createOwnedPost();
      const chat = await startChatAs(buyerToken, post.id);
      await selectBuyer(post.id, chat.chatId).expect(201);

      const anonView = await request(app.getHttpServer())
        .get(`/posts/${post.id}`)
        .expect(200);
      expect(
        (anonView.body as { owner: { phone?: string } }).owner.phone,
      ).toBeUndefined();
    });
  });
});
