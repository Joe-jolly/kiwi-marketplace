import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PostStatus, type Prisma, type User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { postDetailSelect } from './post.select';

type MutablePostState = {
  id: string;
  ownerId: string;
  status: PostStatus;
};

@Injectable()
export class PostsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.post.findMany({
      where: {
        status: PostStatus.ACTIVE,
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        title: true,
        price: true,
        latitude: true,
        longitude: true,
        status: true,
        createdAt: true,
        owner: {
          select: {
            id: true,
            displayName: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
          },
        },
        images: {
          orderBy: {
            displayOrder: 'asc',
          },
          select: {
            imageUrl: true,
            displayOrder: true,
          },
        },
      },
    });
  }

  async findOne(id: string) {
    const post = await this.prisma.post.findFirst({
      where: {
        id,
        status: PostStatus.ACTIVE,
      },
      select: postDetailSelect,
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    return post;
  }

  async update(id: string, user: User, dto: UpdatePostDto) {
    return this.prisma.$transaction(async (tx) => {
      const post = await tx.post.findUnique({
        where: { id },
        select: {
          id: true,
          ownerId: true,
          status: true,
        },
      });

      this.assertPostCanBeChanged(
        post,
        user,
        'Only active posts can be updated',
      );

      const data: Prisma.PostUpdateInput = {};

      if (dto.title !== undefined) {
        data.title = dto.title;
      }

      if (dto.price !== undefined) {
        data.price = dto.price;
      }

      if (dto.description !== undefined) {
        data.description = dto.description;
      }

      if (dto.details !== undefined) {
        data.details = dto.details as Prisma.InputJsonValue;
      }

      if (dto.latitude !== undefined) {
        data.latitude = dto.latitude;
      }

      if (dto.longitude !== undefined) {
        data.longitude = dto.longitude;
      }

      if (dto.imageUrls !== undefined) {
        data.images = {
          deleteMany: {},
          create: dto.imageUrls.map((imageUrl, displayOrder) => ({
            imageUrl,
            displayOrder,
          })),
        };
      }

      return tx.post.update({
        where: { id: post.id },
        data,
        select: postDetailSelect,
      });
    });
  }

  async remove(id: string, user: User) {
    await this.prisma.$transaction(async (tx) => {
      const post = await tx.post.findFirst({
        where: {
          id,
          status: PostStatus.ACTIVE,
        },
        select: {
          id: true,
          ownerId: true,
        },
      });

      if (!post) {
        throw new NotFoundException('Post not found');
      }

      if (post.ownerId !== user.id) {
        throw new ForbiddenException();
      }

      await tx.post.update({
        where: { id: post.id },
        data: {
          status: PostStatus.DELETED,
        },
      });
    });
  }

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
          price: dto.price,
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

  private assertPostCanBeChanged(
    post: MutablePostState | null,
    user: User,
    inactivePostMessage: string,
  ): asserts post is MutablePostState {
    if (!post) {
      throw new NotFoundException('Post not found');
    }

    if (post.ownerId !== user.id) {
      throw new ForbiddenException();
    }

    if (post.status !== PostStatus.ACTIVE) {
      throw new ConflictException(inactivePostMessage);
    }
  }
}
