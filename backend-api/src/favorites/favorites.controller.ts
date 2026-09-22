import {
  Controller,
  Delete,
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
import { FavoritesService } from './favorites.service';

// Explicit per-method paths, not a class-level `@Controller('favorites')`
// prefix: `Favorite Post`/`Unfavorite Post` are Post-scoped operations
// (API Constitution §15, and the existing `/posts/:id/restorations`
// nested-action precedent), while `GET /favorites` ("My Favorites") is its
// own top-level resource, owned by this distinct Favorites module
// (Technical Constitution §_ "Favorites Module"). Kept in one controller
// rather than split across `PostsController` and a second one, since both
// route groups are owned by the same small `FavoritesService`.
@Controller()
export class FavoritesController {
  constructor(private readonly favoritesService: FavoritesService) {}

  @Post('posts/:postId/favorites')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  add(@Param('postId') postId: string, @CurrentUser() user: User) {
    return this.favoritesService.add(postId, user);
  }

  @Delete('posts/:postId/favorites')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('postId') postId: string, @CurrentUser() user: User) {
    return this.favoritesService.remove(postId, user);
  }

  @Get('favorites')
  @UseGuards(JwtAuthGuard)
  findMine(
    @CurrentUser() user: User,
    @Query() query: CursorPaginationQueryDto,
  ) {
    return this.favoritesService.findMine(user, query);
  }
}
