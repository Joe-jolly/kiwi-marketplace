import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDefined,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

function isLocationUpdateRequired(dto: UpdatePostDto): boolean {
  return dto.latitude !== undefined || dto.longitude !== undefined;
}

export class UpdatePostDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  price?: number;

  @IsString()
  @IsOptional()
  description?: string;

  @IsObject()
  @IsOptional()
  details?: Record<string, unknown>;

  // Location updates are all-or-nothing: supplying either coordinate requires
  // both, so the generated PostGIS `location` column cannot drift to a
  // half-updated point.
  @ValidateIf(isLocationUpdateRequired)
  @IsDefined()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ValidateIf(isLocationUpdateRequired)
  @IsDefined()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  // Whole-array replacement when present (Image Storage V1 spec, Ordering
  // Rules); omitted entirely leaves the post's existing images unchanged.
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(15)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @IsOptional()
  imageKeys?: string[];
}
