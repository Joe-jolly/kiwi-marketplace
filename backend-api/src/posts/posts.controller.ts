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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { User } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt.auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt.auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreatePostDto } from './dto/create-post.dto';
import { FindPostsQueryDto } from './dto/find-posts-query.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { PostsService } from './posts.service';

// Image Storage V1 spec: "the configured maximum original-file size" is left
// as an implementation-time constant (no figure is fixed by ADR-005 or the
// Technical Constitution). Multer rejects oversized uploads before the
// buffer is fully read; `FileInterceptor` maps that rejection to `413`
// automatically (`@nestjs/platform-express`'s `transformException`).
const MAX_ORIGINAL_IMAGE_BYTES = 10 * 1024 * 1024;

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

  // Static path segment, so it does not compete with `create()`'s `/posts`
  // route (unlike `GET /posts/me` vs `GET /posts/:id` above). Uploads a
  // single original image; does not attach it to a post (Image Storage V1
  // spec, Endpoint Definition).
  @Post('images')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
      limits: {
        fileSize: MAX_ORIGINAL_IMAGE_BYTES,
        files: 1,
        // Request Format: "No other fields are accepted on this request."
        fields: 0,
      },
    }),
  )
  @HttpCode(HttpStatus.CREATED)
  uploadImage(
    @CurrentUser() user: User,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.postsService.uploadImage(user, file);
  }
}
