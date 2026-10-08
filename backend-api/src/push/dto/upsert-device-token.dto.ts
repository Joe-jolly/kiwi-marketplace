import { IsString, IsOptional } from 'class-validator';

export class UpsertDeviceTokenDto {
  @IsString()
  token: string;

  @IsString()
  @IsOptional()
  platform?: string;
}
