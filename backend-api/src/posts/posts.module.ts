import { Module } from '@nestjs/common';
import { ChatsModule } from '../chats/chats.module';
import { FeedQueryBuilder } from './feed/feed-query.builder';
import { GeoFeedQueryBuilder } from './feed/geo-feed-query.builder';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';

@Module({
  // `ChatsModule` (for its exported `ChatsGateway`) is needed by
  // `PostsService.selectBuyer()`/`completeListing()` (Phase 11 Reservation)
  // to emit the best-effort `post:status-changed` realtime event, reusing
  // the gateway's existing per-user-room infrastructure rather than
  // duplicating it.
  imports: [ChatsModule],
  controllers: [PostsController],
  providers: [PostsService, FeedQueryBuilder, GeoFeedQueryBuilder],
})
export class PostsModule {}
