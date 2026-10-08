import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt.auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CursorPaginationQueryDto } from '../common/dto/cursor-pagination-query.dto';
import { ChatsService } from './chats.service';
import { SendMessageDto } from './dto/send-message.dto';

// Explicit per-method paths, not a class-level prefix: `POST
// /posts/:postId/messages` is a Post-scoped "Create Chat" action (API
// Constitution §17), the same nested-action shape as
// `/posts/:id/favorites`/`/posts/:id/restorations`, while `/chats` and
// `/chats/:chatId/...` are their own top-level resource. Both groups are
// owned by this one small `ChatsService`, mirroring `FavoritesController`.
@Controller()
export class ChatsController {
  constructor(private readonly chatsService: ChatsService) {}

  @Post('posts/:postId/messages')
  @UseGuards(JwtAuthGuard)
  sendFirstMessage(
    @Param('postId') postId: string,
    @CurrentUser() user: User,
    @Body() dto: SendMessageDto,
  ) {
    return this.chatsService.sendFirstMessage(postId, user, dto);
  }

  @Post('chats/:chatId/messages')
  @UseGuards(JwtAuthGuard)
  sendMessage(
    @Param('chatId') chatId: string,
    @CurrentUser() user: User,
    @Body() dto: SendMessageDto,
  ) {
    return this.chatsService.sendMessage(chatId, user, dto);
  }

  @Get('chats')
  @UseGuards(JwtAuthGuard)
  findMine(
    @CurrentUser() user: User,
    @Query() query: CursorPaginationQueryDto,
  ) {
    return this.chatsService.findMine(user, query);
  }

  @Get('chats/:chatId')
  @UseGuards(JwtAuthGuard)
  findOne(@Param('chatId') chatId: string, @CurrentUser() user: User) {
    return this.chatsService.findOne(chatId, user);
  }

  @Get('chats/:chatId/messages')
  @UseGuards(JwtAuthGuard)
  findMessages(
    @Param('chatId') chatId: string,
    @CurrentUser() user: User,
    @Query() query: CursorPaginationQueryDto,
  ) {
    return this.chatsService.findMessages(chatId, user, query);
  }

  @Post('chats/:chatId/reads')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  markRead(@Param('chatId') chatId: string, @CurrentUser() user: User) {
    return this.chatsService.markRead(chatId, user);
  }
}
