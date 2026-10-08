import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgresql://kiwi:kiwi_dev_password@localhost:5433/kiwi_marketplace?schema=public';

describe('Notifications (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let userId: string;
  let userToken: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = E2E_DATABASE_URL;
    process.env.JWT_SECRET =
      process.env.JWT_SECRET ?? 'notifications-e2e-secret';

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

    // Clean up
    await prisma.notification.deleteMany();
    await prisma.user.deleteMany({
      where: { phone: '__notifications_user__' },
    });

    const passwordHash = await bcrypt.hash('password123', 10);

    const user = await prisma.user.create({
      data: {
        phone: '__notifications_user__',
        passwordHash,
        displayName: 'User',
      },
    });
    userId = user.id;

    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ phone: '__notifications_user__', password: 'password123' })
      .expect(200);

    userToken = (response.body as { accessToken: string }).accessToken;
  });

  beforeEach(async () => {
    await prisma.notification.deleteMany({});
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({});
    await app.close();
  });

  it('should get unread count', async () => {
    await prisma.notification.create({
      data: {
        userId,
        type: 'RESERVATION_CREATED',
        title: 'Title',
        body: 'Body',
        isRead: false,
      },
    });

    const response = await request(app.getHttpServer())
      .get('/notifications/unread-count')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    expect((response.body as { count: number }).count).toBe(1);
  });

  it('should list notifications with cursor pagination', async () => {
    const n1 = await prisma.notification.create({
      data: {
        userId,
        type: 'RESERVATION_CREATED',
        title: 'T1',
        body: 'B1',
      },
    });
    const n2 = await prisma.notification.create({
      data: {
        userId,
        type: 'RESERVATION_CREATED',
        title: 'T2',
        body: 'B2',
      },
    });

    const response = await request(app.getHttpServer())
      .get('/notifications')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    const body = response.body as {
      items: { id: string }[];
      hasNextPage: boolean;
    };
    expect(body.items).toHaveLength(2);
    expect(body.items[0].id).toBe(n2.id);
    expect(body.items[1].id).toBe(n1.id);
    expect(body.hasNextPage).toBe(false);
  });

  it('should mark notification as read', async () => {
    const n1 = await prisma.notification.create({
      data: {
        userId,
        type: 'RESERVATION_CREATED',
        title: 'T1',
        body: 'B1',
        isRead: false,
      },
    });

    await request(app.getHttpServer())
      .patch(`/notifications/${n1.id}/read`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    const updated = await prisma.notification.findUnique({
      where: { id: n1.id },
    });
    expect(updated?.isRead).toBe(true);

    // Idempotent
    await request(app.getHttpServer())
      .patch(`/notifications/${n1.id}/read`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
  });

  it('should mark all as read', async () => {
    await prisma.notification.create({
      data: {
        userId,
        type: 'RESERVATION_CREATED',
        title: 'T1',
        body: 'B1',
        isRead: false,
      },
    });
    await prisma.notification.create({
      data: {
        userId,
        type: 'RESERVATION_CREATED',
        title: 'T2',
        body: 'B2',
        isRead: false,
      },
    });

    await request(app.getHttpServer())
      .post('/notifications/read-all')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    const unreadCount = await prisma.notification.count({
      where: { userId, isRead: false },
    });
    expect(unreadCount).toBe(0);
  });
});
