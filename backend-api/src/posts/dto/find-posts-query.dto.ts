import { Transform, Type, type TransformFnParams } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class FindPostsQueryDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
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
}
