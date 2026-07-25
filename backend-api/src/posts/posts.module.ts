import { Module } from '@nestjs/common';
import { FeedQueryBuilder } from './feed/feed-query.builder';
import { GeoFeedQueryBuilder } from './feed/geo-feed-query.builder';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';

@Module({
  controllers: [PostsController],
  providers: [PostsService, FeedQueryBuilder, GeoFeedQueryBuilder],
})
export class PostsModule {}
