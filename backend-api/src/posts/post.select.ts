import type { Prisma } from '@prisma/client';

export const postFeedSelect = {
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
} satisfies Prisma.PostSelect;

export const postDetailSelect = {
  id: true,
  title: true,
  price: true,
  description: true,
  details: true,
  latitude: true,
  longitude: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  owner: {
    select: {
      id: true,
      displayName: true,
      avatarUrl: true,
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
} satisfies Prisma.PostSelect;

export const mutablePostSelect = {
  id: true,
  ownerId: true,
  status: true,
} satisfies Prisma.PostSelect;
