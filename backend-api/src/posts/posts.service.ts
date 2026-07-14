import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePostDto } from './dto/create-post.dto';

@Injectable()
export class PostsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(user: User, dto: CreatePostDto) {
    return this.prisma.$transaction(async (tx) => {
      const category = await tx.category.findUnique({
        where: { id: dto.categoryId },
        select: { id: true },
      });

      if (!category) {
        throw new NotFoundException('Category not found');
      }

      return tx.post.create({
        data: {
          ownerId: user.id,
          categoryId: dto.categoryId,
          title: dto.title,
          description: dto.description,
          details: dto.details as Prisma.InputJsonValue,
          latitude: dto.latitude,
          longitude: dto.longitude,
          images: {
            create: dto.imageUrls.map((imageUrl, displayOrder) => ({
              imageUrl,
              displayOrder,
            })),
          },
        },
        include: {
          images: true,
        },
      });
    });
  }
}
