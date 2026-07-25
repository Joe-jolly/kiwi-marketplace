import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDefined,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
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

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsUrl({}, { each: true })
  @IsOptional()
  imageUrls?: string[];
}
