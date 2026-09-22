import { BadRequestException } from '@nestjs/common';

const CURSOR_VERSION = 1;

interface KeysetCursorPayload {
  v: typeof CURSOR_VERSION;
  /** Scopes a cursor to the endpoint that issued it (see `decodeKeysetCursor`). */
  purpose: string;
  sortValue: string; // ISO date
  id: string;
}

export interface KeysetCursor {
  sortValue: Date;
  id: string;
}

/**
 * Small, generic keyset cursor for endpoints with exactly one fixed sort
 * mode (`<sortValue> desc, <id> desc`) — `GET /posts/me` and
 * `GET /favorites`. Deliberately not the feed's `cursor.util.ts`, which is
 * coupled to `SortOption`'s several sort modes for a reason that doesn't
 * apply to either of these callers.
 *
 * `purpose` scopes a cursor to the endpoint that issued it (e.g.
 * `"posts-mine"` vs. `"favorites-mine"`), mirroring how the feed's own
 * cursor is scoped by sort mode — without it, a `/posts/me` cursor handed
 * to `/favorites` (or vice versa) would decode successfully but paginate
 * against the wrong semantics instead of failing loudly.
 */
export function encodeKeysetCursor(
  purpose: string,
  sortValue: Date,
  id: string,
): string {
  const payload: KeysetCursorPayload = {
    v: CURSOR_VERSION,
    purpose,
    sortValue: sortValue.toISOString(),
    id,
  };

  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
}

export function decodeKeysetCursor(
  purpose: string,
  cursor: string | undefined,
): KeysetCursor | undefined {
  if (!cursor) {
    return undefined;
  }

  let payload: Partial<KeysetCursorPayload>;

  try {
    payload = JSON.parse(
      Buffer.from(cursor, 'base64').toString('utf8'),
    ) as Partial<KeysetCursorPayload>;
  } catch {
    throw new BadRequestException('Invalid cursor');
  }

  if (
    payload.v !== CURSOR_VERSION ||
    payload.purpose !== purpose ||
    typeof payload.id !== 'string' ||
    payload.id.length === 0 ||
    typeof payload.sortValue !== 'string' ||
    Number.isNaN(Date.parse(payload.sortValue))
  ) {
    throw new BadRequestException('Invalid cursor');
  }

  return { sortValue: new Date(payload.sortValue), id: payload.id };
}
