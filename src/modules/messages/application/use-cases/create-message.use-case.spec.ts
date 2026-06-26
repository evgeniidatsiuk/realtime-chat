import { TenantContext } from '../../../../common/tenant/tenant-context';
import type { Message } from '../../domain/message.entity';
import type { MessageRepository } from '../../domain/message.repository';
import type { MessagePublisher } from '../ports/message-publisher.port';
import { CreateMessageUseCase } from './create-message.use-case';

describe('CreateMessageUseCase', () => {
  const buildContext = (tenantId = 'tenant-a', userId = 'user-1') => {
    const ctx = new TenantContext();
    return {
      ctx,
      run: <T>(fn: () => Promise<T> | T) => ctx.run({ tenantId, userId }, fn),
    };
  };

  const buildRepo = (): jest.Mocked<MessageRepository> => ({
    save: jest.fn().mockResolvedValue(undefined),
    list: jest.fn(),
  });

  const buildPublisher = (): jest.Mocked<MessagePublisher> => ({
    publishMessageCreated: jest.fn().mockResolvedValue(undefined),
  });

  it('persists the message before publishing the event', async () => {
    const { ctx, run } = buildContext();
    const repo = buildRepo();
    const publisher = buildPublisher();
    const order: string[] = [];
    repo.save.mockImplementation(async () => {
      order.push('save');
    });
    publisher.publishMessageCreated.mockImplementation(async () => {
      order.push('publish');
    });
    const useCase = new CreateMessageUseCase(repo, publisher, ctx);

    const message = await run(() =>
      useCase.execute({ conversationId: 'conv-1', content: 'hello' }),
    );

    expect(message.tenantId).toBe('tenant-a');
    expect(message.senderId).toBe('user-1');
    expect(order).toEqual(['save', 'publish']);
  });

  it('uses senderId from the DTO when provided', async () => {
    const { ctx, run } = buildContext();
    const repo = buildRepo();
    const publisher = buildPublisher();
    const useCase = new CreateMessageUseCase(repo, publisher, ctx);

    const message = await run(() =>
      useCase.execute({ conversationId: 'conv-1', content: 'hi', senderId: 'override' }),
    );
    expect(message.senderId).toBe('override');
  });

  it('propagates publisher failure after the row is persisted', async () => {
    const { ctx, run } = buildContext();
    const repo = buildRepo();
    const publisher = buildPublisher();
    publisher.publishMessageCreated.mockRejectedValueOnce(new Error('broker down'));
    const useCase = new CreateMessageUseCase(repo, publisher, ctx);

    await expect(
      run(() => useCase.execute({ conversationId: 'conv-1', content: 'hi' })),
    ).rejects.toThrow('broker down');
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid input from the domain layer', async () => {
    const { ctx, run } = buildContext();
    const repo = buildRepo();
    const publisher = buildPublisher();
    const useCase = new CreateMessageUseCase(repo, publisher, ctx);

    await expect(
      run(() => useCase.execute({ conversationId: 'conv-1', content: '   ' })),
    ).rejects.toThrow(/content/);
    expect(repo.save).not.toHaveBeenCalled();
  });

  // satisfies an unused-import check in strict TS
  void ({} as Message);
});
