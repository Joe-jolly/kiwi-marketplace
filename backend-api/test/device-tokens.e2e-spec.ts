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

describe('Device Tokens (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let user1Id: string;
  let user2Id: string;
  let user1Token: string;
  let user2Token: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = E2E_DATABASE_URL;
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'device-e2e-secret';

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
    await prisma.deviceToken.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.user.deleteMany({
      where: {
        phone: { in: ['__device_user1__', '__device_user2__'] },
      },
    });

    const passwordHash = await bcrypt.hash('password123', 10);

    const user1 = await prisma.user.create({
      data: {
        phone: '__device_user1__',
        passwordHash,
        displayName: 'User 1',
      },
    });
    user1Id = user1.id;

    const user2 = await prisma.user.create({
      data: {
        phone: '__device_user2__',
        passwordHash,
        displayName: 'User 2',
      },
    });
    user2Id = user2.id;

    async function loginAs(phone: string): Promise<string> {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ phone, password: 'password123' })
        .expect(200);
      return (response.body as { accessToken: string }).accessToken;
    }

    user1Token = await loginAs('__device_user1__');
    user2Token = await loginAs('__device_user2__');
  });

  afterAll(async () => {
    await prisma.deviceToken.deleteMany({});
    await app.close();
  });

  it('should register a new device token', async () => {
    const response = await request(app.getHttpServer())
      .post('/users/me/device-tokens')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({
        token: 'token_123',
        platform: 'ios',
      })
      .expect(201);

    const body = response.body as {
      token: string;
      userId: string;
      platform: string;
    };
    expect(body.token).toBe('token_123');
    expect(body.userId).toBe(user1Id);
    expect(body.platform).toBe('ios');
  });

  it('should reassign a device token on hand-me-down (upsert)', async () => {
    const response = await request(app.getHttpServer())
      .post('/users/me/device-tokens')
      .set('Authorization', `Bearer ${user2Token}`)
      .send({
        token: 'token_123',
        platform: 'ios',
      })
      .expect(201);

    const body = response.body as {
      token: string;
      userId: string;
      platform: string;
    };
    expect(body.token).toBe('token_123');
    expect(body.userId).toBe(user2Id);

    const tokens = await prisma.deviceToken.findMany({
      where: { token: 'token_123' },
    });
    expect(tokens.length).toBe(1);
    expect(tokens[0].userId).toBe(user2Id);
  });

  it('should delete a device token', async () => {
    await request(app.getHttpServer())
      .delete('/users/me/device-tokens/token_123')
      .set('Authorization', `Bearer ${user2Token}`)
      .expect(204);

    const tokens = await prisma.deviceToken.findMany({
      where: { token: 'token_123' },
    });
    expect(tokens.length).toBe(0);
  });

  it("should not delete another user's token", async () => {
    await prisma.deviceToken.create({
      data: { token: 'token_456', userId: user1Id },
    });

    await request(app.getHttpServer())
      .delete('/users/me/device-tokens/token_456')
      .set('Authorization', `Bearer ${user2Token}`)
      .expect(204);

    const tokens = await prisma.deviceToken.findMany({
      where: { token: 'token_456' },
    });
    expect(tokens.length).toBe(1);
  });
});
