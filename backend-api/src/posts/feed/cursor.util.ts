import { BadRequestException } from '@nestjs/common';
import { SortOption } from './sort-option.enum';

const CURSOR_VERSION = 1;

interface NewestCursorFields {
  sort: SortOption.NEWEST;
  sortValue: string; // ISO createdAt
  id: string;
}

interface PriceCursorFields {
  sort: SortOption.PRICE_ASC | SortOption.PRICE_DESC;
  sortValue: number; // price
  id: string;
}

interface NearestCursorFields {
  sort: SortOption.NEAREST;
  sortValue: number; // distance
  id: string;
}

interface RelevanceCursorFields {
  sort: SortOption.RELEVANCE;
  sortValue: number; // relevance score
  id: string;
}

// Discriminated on `sort`, so `sortValue`'s type is guaranteed to match
// whichever field the active sorting mode paginates on.
export type CursorFields =
  | NewestCursorFields
  | PriceCursorFields
  | NearestCursorFields
  | RelevanceCursorFields;

export type FeedCursor = CursorFields & { v: typeof CURSOR_VERSION };

export function encodeCursor(input: CursorFields): string {
  const payload: FeedCursor = { v: CURSOR_VERSION, ...input };

  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
}

export function decodeCursor(
  cursor: string | undefined,
  requestedSort: SortOption,
): FeedCursor | undefined {
  if (!cursor) {
    return undefined;
  }

  let payload: Partial<FeedCursor>;

  try {
    payload = JSON.parse(
      Buffer.from(cursor, 'base64').toString('utf8'),
    ) as Partial<FeedCursor>;
  } catch {
    throw new BadRequestException('Invalid cursor');
  }

  if (!isValidCursorPayload(payload)) {
    throw new BadRequestException('Invalid cursor');
  }

  if (payload.sort !== requestedSort) {
    throw new BadRequestException(
      'Cursor does not match requested sorting strategy.',
    );
  }

  return payload;
}

function isValidCursorPayload(
  payload: Partial<FeedCursor>,
): payload is FeedCursor {
  if (payload.v !== CURSOR_VERSION) {
    return false;
  }

  if (typeof payload.id !== 'string' || payload.id.length === 0) {
    return false;
  }

  switch (payload.sort) {
    case SortOption.NEWEST:
      return (
        typeof payload.sortValue === 'string' &&
        !Number.isNaN(Date.parse(payload.sortValue))
      );
    case SortOption.PRICE_ASC:
    case SortOption.PRICE_DESC:
    case SortOption.NEAREST:
    case SortOption.RELEVANCE:
      return (
        typeof payload.sortValue === 'number' &&
        Number.isFinite(payload.sortValue)
      );
    default:
      return false;
  }
}
