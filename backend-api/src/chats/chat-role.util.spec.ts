import { resolveChatRole } from './chat-role.util';

describe('resolveChatRole', () => {
  const chat = {
    participantId: 'participant-1',
    post: { ownerId: 'owner-1' },
  };

  it('returns "owner" when the user is the post owner', () => {
    expect(resolveChatRole(chat, 'owner-1')).toBe('owner');
  });

  it('returns "participant" when the user is the chat participant', () => {
    expect(resolveChatRole(chat, 'participant-1')).toBe('participant');
  });

  it('returns null when the user is neither side of the chat', () => {
    expect(resolveChatRole(chat, 'stranger-1')).toBeNull();
  });

  it('prefers "owner" if a user were ever both (defensive, cannot happen in practice)', () => {
    const selfChat = {
      participantId: 'same-user',
      post: { ownerId: 'same-user' },
    };
    expect(resolveChatRole(selfChat, 'same-user')).toBe('owner');
  });
});
