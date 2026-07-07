import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface CreateUserData {
  phone: string;
  passwordHash: string;
  displayName: string;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}
  create(data: CreateUserData) {
    return this.prisma.user.create({
      data,
    });
  }

  findByPhone(phone: string) {
    return this.prisma.user.findUnique({
      where: { phone },
    });
  }
  
  findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }
}