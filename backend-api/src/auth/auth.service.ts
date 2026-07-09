import { Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service';

interface RegisterData {
  phone: string;
  password: string;
  displayName: string;
}

@Injectable()
export class AuthService {
  constructor(private readonly usersService: UsersService) {}

  async register(data: RegisterData) {
    const existingUser = await this.usersService.findByPhone(data.phone);

    if (existingUser) {
      return null;
    }

    // TODO: Hash the password before storing it.
    const passwordHash = data.password;

    const user = await this.usersService.create({
      phone: data.phone,
      passwordHash,
      displayName: data.displayName,
    });

    // TODO: Generate and return JWT after authentication is implemented.
    return user;
  }
}

