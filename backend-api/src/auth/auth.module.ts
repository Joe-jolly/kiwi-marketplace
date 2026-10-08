import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import type { JwtModuleOptions } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { UsersModule } from '../users/users.module';

type JwtExpiresIn = NonNullable<JwtModuleOptions['signOptions']>['expiresIn'];

@Module({
  imports: [
    UsersModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: {
        expiresIn: process.env.JWT_EXPIRES_IN as JwtExpiresIn,
      },
    }),
  ],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
  // Exported so other modules (`ChatsModule`'s Socket.IO gateway) can reuse
  // this already-configured `JwtService` singleton to verify a handshake
  // token, instead of a second `JwtModule.register({...})` with duplicated
  // secret/expiry config (backend rule: avoid duplicated code).
  exports: [JwtModule],
})
export class AuthModule {}
