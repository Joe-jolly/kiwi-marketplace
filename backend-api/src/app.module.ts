import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { PostsModule } from './posts/posts.module';
import { StorageModule } from './storage/storage.module';

// `StorageModule` is `@Global()` (like `PrismaModule`), but Nest still
// requires every module to be imported somewhere in the graph for its
// providers to be instantiated at all — `PostsService` now depends on
// `StorageService` (Image Storage V1 spec / ADR-005).
@Module({
  imports: [PrismaModule, StorageModule, UsersModule, AuthModule, PostsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
