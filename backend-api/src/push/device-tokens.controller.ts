import {
  Controller,
  Post,
  Body,
  Delete,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt.auth.guard';
import { UpsertDeviceTokenDto } from './dto/upsert-device-token.dto';

@Controller('users/me/device-tokens')
@UseGuards(JwtAuthGuard)
export class DeviceTokensController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async upsertToken(
    @CurrentUser() user: User,
    @Body() dto: UpsertDeviceTokenDto,
  ) {
    const userId = user.id;
    const token = await this.prisma.deviceToken.upsert({
      where: { token: dto.token },
      create: {
        userId,
        token: dto.token,
        platform: dto.platform,
      },
      update: {
        userId, // Handles hand-me-down tokens (reassigns to the new user)
        platform: dto.platform,
      },
    });

    return token;
  }

  @Delete(':token')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteToken(@CurrentUser() user: User, @Param('token') token: string) {
    const userId = user.id;
    // Only delete if it belongs to this user
    await this.prisma.deviceToken.deleteMany({
      where: {
        token,
        userId,
      },
    });
  }
}
