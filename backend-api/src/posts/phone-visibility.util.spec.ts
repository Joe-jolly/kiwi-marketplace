import { PostStatus } from '@prisma/client';
import { canViewSellerPhone } from './phone-visibility.util';

describe('canViewSellerPhone', () => {
  const buyerId = 'buyer-1';
  const otherUserId = 'other-1';

  it('returns true for the selected buyer once the post is RESERVED', () => {
    const post = { status: PostStatus.RESERVED, reservedChatId: 'chat-1' };
    expect(canViewSellerPhone(post, buyerId, buyerId)).toBe(true);
  });

  it('returns true for the selected buyer once the post is COMPLETED', () => {
    const post = { status: PostStatus.COMPLETED, reservedChatId: 'chat-1' };
    expect(canViewSellerPhone(post, buyerId, buyerId)).toBe(true);
  });

  it('returns false for a viewer who is not the selected buyer', () => {
    const post = { status: PostStatus.RESERVED, reservedChatId: 'chat-1' };
    expect(canViewSellerPhone(post, buyerId, otherUserId)).toBe(false);
  });

  it('returns false while the post is still ACTIVE, even for the eventual buyer', () => {
    const post = { status: PostStatus.ACTIVE, reservedChatId: null };
    expect(canViewSellerPhone(post, null, buyerId)).toBe(false);
  });

  it('returns false for a PAUSED post', () => {
    const post = { status: PostStatus.PAUSED, reservedChatId: null };
    expect(canViewSellerPhone(post, null, buyerId)).toBe(false);
  });

  it('returns false for a DELETED post', () => {
    const post = { status: PostStatus.DELETED, reservedChatId: null };
    expect(canViewSellerPhone(post, null, buyerId)).toBe(false);
  });

  it('returns false when reservedChatId is null even if status were somehow RESERVED (defensive)', () => {
    const post = { status: PostStatus.RESERVED, reservedChatId: null };
    expect(canViewSellerPhone(post, null, buyerId)).toBe(false);
  });

  it('returns false when reservedChatParticipantId is null (no resolved buyer passed in)', () => {
    const post = { status: PostStatus.RESERVED, reservedChatId: 'chat-1' };
    expect(canViewSellerPhone(post, null, buyerId)).toBe(false);
  });
});
