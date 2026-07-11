import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() data: { phone: string; password: string; displayName: string }) {
    return this.authService.register(data);
  }

  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() data: { phone: string; password: string }) {
    return this.authService.login(data);
  }
}
