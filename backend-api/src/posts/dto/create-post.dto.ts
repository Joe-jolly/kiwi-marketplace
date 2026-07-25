import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsString,
  IsUrl,
  Max,
  Min,
} from 'class-validator';

export class CreatePostDto {
  @IsString()
  @IsNotEmpty()
  categoryId: string;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsInt()
  @Min(0)
  price: number;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsObject()
  details: Record<string, unknown>;

  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsUrl({}, { each: true })
  imageUrls: string[];
}
