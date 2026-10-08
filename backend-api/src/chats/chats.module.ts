import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { ChatsController } from './chats.controller';
import { ChatsGateway } from './chats.gateway';
import { ChatsService } from './chats.service';

@Module({
  // `AuthModule` (for its exported `JwtModule`) and `UsersModule` are
  // needed by `ChatsGateway`'s handshake authentication — the same two
  // steps `JwtStrategy` already performs for REST, reused directly rather
  // than duplicated.
  imports: [AuthModule, UsersModule],
  controllers: [ChatsController],
  providers: [ChatsService, ChatsGateway],
})
export class ChatsModule {}
