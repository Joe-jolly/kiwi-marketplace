import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt.auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt.auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreatePostDto } from './dto/create-post.dto';
import { FindPostsQueryDto } from './dto/find-posts-query.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { PostsService } from './posts.service';

@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Get()
  findAll(@Query() query: FindPostsQueryDto) {
    return this.postsService.findAll(query);
  }

  // Registered before `:id` so "me" is not captured as a post id.
  @Get('me')
  @UseGuards(JwtAuthGuard)
  findMine(@CurrentUser() user: User) {
    return this.postsService.findMine(user);
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  findOne(@Param('id') id: string, @CurrentUser() user?: User) {
    return this.postsService.findOne(id, user);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() dto: UpdatePostDto,
  ) {
    return this.postsService.update(id, user, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @CurrentUser() user: User) {
    return this.postsService.remove(id, user);
  }

  @Post(':id/restorations')
  @UseGuards(JwtAuthGuard)
  restore(@Param('id') id: string, @CurrentUser() user: User) {
    return this.postsService.restore(id, user);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@CurrentUser() user: User, @Body() dto: CreatePostDto) {
    return this.postsService.create(user, dto);
  }
}
