import { Transform, Type, type TransformFnParams } from 'class-transformer';
import {
  IsDefined,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { SortOption } from '../feed/sort-option.enum';

function isLocationRequired(query: FindPostsQueryDto): boolean {
  return (
    query.latitude !== undefined ||
    query.longitude !== undefined ||
    query.radius !== undefined ||
    query.sort === SortOption.NEAREST
  );
}

// `search` stays optional for every sort mode except RELEVANCE. Mirroring
// `isLocationRequired`'s pattern for NEAREST: validation is gated so a
// missing `search` still fails whenever RELEVANCE is requested, while
// `search` remains untouched (still fully optional) for every other sort.
function isSearchValidationActive(query: FindPostsQueryDto): boolean {
  return query.sort === SortOption.RELEVANCE || query.search !== undefined;
}

export class FindPostsQueryDto {
  @ValidateIf(isSearchValidationActive)
  @IsDefined({ message: 'search is required when sort=RELEVANCE' })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim() : (value as unknown),
  )
  search?: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  categoryId?: string;

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

  @IsEnum(SortOption)
  @IsOptional()
  sort: SortOption = SortOption.NEWEST;

  // Location parameters are all-or-nothing, and are mandatory when sort=NEAREST
  // is requested. @ValidateIf (rather than @IsOptional) ensures a missing field
  // still fails validation whenever the group is required.
  @ValidateIf(isLocationRequired)
  @IsDefined()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ValidateIf(isLocationRequired)
  @IsDefined()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @ValidateIf(isLocationRequired)
  @IsDefined()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  radius?: number;
}
