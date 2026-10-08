import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  // `ChatsGateway` (Phase 10 Step 2) needs Socket.IO, not the raw `ws`
  // adapter Nest falls back to otherwise. Explicit for clarity even though
  // Nest can auto-detect `@nestjs/platform-socket.io` once installed.
  app.useWebSocketAdapter(new IoAdapter(app));
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
