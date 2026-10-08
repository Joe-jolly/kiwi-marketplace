import type { JwtService } from '@nestjs/jwt';
import type { Socket } from 'socket.io';
import type { UsersService } from '../users/users.service';
import { ChatsGateway } from './chats.gateway';

const verifyAsync = jest.fn<
  Promise<unknown>,
  [string, Record<string, unknown>]
>();
const findById = jest.fn<Promise<unknown>, [string]>();
const join = jest.fn().mockResolvedValue(undefined);
const disconnect = jest.fn();

function createMockSocket(token?: string): Socket {
  return {
    handshake: { auth: token === undefined ? {} : { token } },
    join,
    disconnect,
  } as unknown as Socket;
}

describe('ChatsGateway.handleConnection', () => {
  let gateway: ChatsGateway;

  beforeEach(() => {
    jest.clearAllMocks();
    join.mockResolvedValue(undefined);
    gateway = new ChatsGateway(
      { verifyAsync } as unknown as JwtService,
      { findById } as unknown as UsersService,
    );
  });

  it('joins the per-user room for a valid token', async () => {
    verifyAsync.mockResolvedValue({ sub: 'user-1' });
    findById.mockResolvedValue({ id: 'user-1' });
    const client = createMockSocket('valid-token');

    await gateway.handleConnection(client);

    expect(verifyAsync).toHaveBeenCalledTimes(1);
    expect(verifyAsync.mock.calls[0][0]).toBe('valid-token');
    expect(join).toHaveBeenCalledWith('user:user-1');
    expect(disconnect).not.toHaveBeenCalled();
  });

  it('disconnects a socket with no token at all', async () => {
    const client = createMockSocket(undefined);

    await gateway.handleConnection(client);

    expect(verifyAsync).not.toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalledWith(true);
  });

  it('disconnects a socket with an empty-string token', async () => {
    const client = createMockSocket('');

    await gateway.handleConnection(client);

    expect(verifyAsync).not.toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalledWith(true);
  });

  it('disconnects a socket whose token fails verification', async () => {
    verifyAsync.mockRejectedValue(new Error('invalid signature'));
    const client = createMockSocket('bad-token');

    await gateway.handleConnection(client);

    expect(join).not.toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalledWith(true);
  });

  it('disconnects a socket whose token is valid but the user no longer exists', async () => {
    verifyAsync.mockResolvedValue({ sub: 'ghost' });
    findById.mockResolvedValue(null);
    const client = createMockSocket('valid-token');

    await gateway.handleConnection(client);

    expect(join).not.toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalledWith(true);
  });
});
