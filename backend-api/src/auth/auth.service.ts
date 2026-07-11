import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';

const BCRYPT_SALT_ROUNDS = 12;

interface RegisterData {
  phone: string;
  password: string;
  displayName: string;
}

interface LoginData {
  phone: string;
  password: string;
}

@Injectable()
export class AuthService {
  constructor(private readonly usersService: UsersService) {}

  async register(data: RegisterData) {
    const existingUser = await this.usersService.findByPhone(data.phone);

    if (existingUser) {
      throw new ConflictException('Phone number already exists');
    }

    const passwordHash = await bcrypt.hash(data.password, BCRYPT_SALT_ROUNDS);

    const user = await this.usersService.create({
      phone: data.phone,
      passwordHash,
      displayName: data.displayName,
    });

    // TODO: Generate and return JWT after authentication is implemented.
    return user;
  }

  async login(data: LoginData) {
    const user = await this.usersService.findByPhone(data.phone);

    if (!user) {
      throw new UnauthorizedException('Invalid phone or password');
    }

    const isPasswordValid = await bcrypt.compare(data.password, user.passwordHash);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid phone or password');
    }

    // TODO: Generate and return JWT after authentication is implemented.
    return user;
  }
}

