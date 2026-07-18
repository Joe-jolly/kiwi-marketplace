import { BadRequestException } from '@nestjs/common';

const CURSOR_VERSION = 1;

export interface FeedCursor {
  v: typeof CURSOR_VERSION;
  createdAt: string;
  id: string;
}

export function encodeCursor(input: Omit<FeedCursor, 'v'>): string {
  const payload: FeedCursor = {
    v: CURSOR_VERSION,
    createdAt: input.createdAt,
    id: input.id,
  };

  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
}

export function decodeCursor(cursor?: string): FeedCursor | undefined {
  if (!cursor) {
    return undefined;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(cursor, 'base64').toString('utf8'),
    ) as Partial<FeedCursor>;

    if (
      payload.v !== CURSOR_VERSION ||
      typeof payload.createdAt !== 'string' ||
      Number.isNaN(Date.parse(payload.createdAt)) ||
      typeof payload.id !== 'string' ||
      payload.id.length === 0
    ) {
      throw new Error('Invalid cursor payload');
    }

    return {
      v: CURSOR_VERSION,
      createdAt: payload.createdAt,
      id: payload.id,
    };
  } catch {
    throw new BadRequestException('Invalid cursor');
  }
}
