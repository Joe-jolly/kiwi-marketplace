import { Module } from '@nestjs/common';
import { PushService } from './push.service';
import { DeviceTokensController } from './device-tokens.controller';

@Module({
  controllers: [DeviceTokensController],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}
