import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

/**
 * Shared query DTO for every single-sort-mode, keyset-paginated list
 * endpoint (`GET /posts/me`, `GET /favorites`) — both need only an opaque
 * `cursor` and a bounded `limit`, with no sort/filter parameters of their
 * own (unlike the feed's `FindPostsQueryDto`).
 */
export class CursorPaginationQueryDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  cursor?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  @IsOptional()
  limit = 20;
}
