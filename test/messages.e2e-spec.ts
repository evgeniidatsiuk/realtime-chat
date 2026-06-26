import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { CommonModule } from '../src/common/common.module';
import { AllExceptionsFilter } from '../src/common/errors/http-exception.filter';
import { TenantInterceptor } from '../src/common/tenant/tenant.interceptor';
import { MESSAGE_PUBLISHER } from '../src/modules/messages/application/ports/message-publisher.port';
import { CreateMessageUseCase } from '../src/modules/messages/application/use-cases/create-message.use-case';
import { ListMessagesUseCase } from '../src/modules/messages/application/use-cases/list-messages.use-case';
import { SearchMessagesUseCase } from '../src/modules/messages/application/use-cases/search-messages.use-case';
import type { MessageCreatedEvent } from '../src/modules/messages/domain/events/message-created.event';
import { MESSAGE_SEARCH_REPOSITORY } from '../src/modules/messages/domain/message-search.repository';
import { Message } from '../src/modules/messages/domain/message.entity';
import { MESSAGE_REPOSITORY } from '../src/modules/messages/domain/message.repository';
import { OutboxMessagePublisher } from '../src/modules/messages/infrastructure/messaging/outbox-message.publisher';
import { ConversationMessagesController } from '../src/modules/messages/interfaces/http/conversation-messages.controller';
import { MessagesController } from '../src/modules/messages/interfaces/http/messages.controller';
import { OUTBOX_REPOSITORY } from '../src/modules/outbox/domain/outbox.repository';
import { TRANSACTIONAL_WRITER } from '../src/modules/outbox/domain/transactional-writer';
import {
  InMemoryMessageRepository,
  InMemoryMessageSearchRepository,
  InMemoryOutboxRepository,
  InMemoryTransactionalWriter,
} from './in-memory.adapters';

const TOKEN_A = 'dev-token-tenant-a';
const TOKEN_B = 'dev-token-tenant-b';

describe('Messages HTTP API (e2e)', () => {
  let app: NestFastifyApplication;
  let outbox: InMemoryOutboxRepository;
  let writer: InMemoryTransactionalWriter;
  let searchRepo: InMemoryMessageSearchRepository;

  beforeAll(async () => {
    process.env.AUTH_API_TOKENS = `${TOKEN_A}:tenant-a,${TOKEN_B}:tenant-b`;

    const repoInstance = new InMemoryMessageRepository();
    outbox = new InMemoryOutboxRepository();
    writer = new InMemoryTransactionalWriter();
    searchRepo = new InMemoryMessageSearchRepository();

    const moduleRef = await Test.createTestingModule({
      imports: [CommonModule],
      controllers: [MessagesController, ConversationMessagesController],
      providers: [
        CreateMessageUseCase,
        ListMessagesUseCase,
        SearchMessagesUseCase,
        OutboxMessagePublisher,
        { provide: MESSAGE_REPOSITORY, useValue: repoInstance },
        { provide: MESSAGE_SEARCH_REPOSITORY, useValue: searchRepo },
        { provide: OUTBOX_REPOSITORY, useValue: outbox },
        { provide: TRANSACTIONAL_WRITER, useValue: writer },
        {
          provide: MESSAGE_PUBLISHER,
          useFactory: (config: ConfigService) =>
            new OutboxMessagePublisher(outbox, config as never),
          inject: [ConfigService],
        },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
        { provide: APP_INTERCEPTOR, useClass: TenantInterceptor },
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  const inject = (opts: {
    method: 'POST' | 'GET';
    url: string;
    token?: string;
    payload?: unknown;
  }) =>
    app
      .getHttpAdapter()
      .getInstance()
      .inject({
        method: opts.method,
        url: opts.url,
        headers: opts.token ? { authorization: `Bearer ${opts.token}` } : {},
        payload: opts.payload as never,
      });

  // Stands in for `OutboxPoller` in tests: drains pending entries through the
  // in-memory search repository so we can assert end-to-end indexing.
  const drainOutbox = async () => {
    const claimed = await outbox.claim({ batchSize: 100, leaseMs: 1000 });
    for (const entry of claimed) {
      const event = JSON.parse(entry.payload) as MessageCreatedEvent;
      await searchRepo.index(
        Message.rehydrate({
          id: event.payload.id,
          tenantId: event.payload.tenantId,
          conversationId: event.payload.conversationId,
          senderId: event.payload.senderId,
          content: event.payload.content,
          timestamp: new Date(event.payload.timestamp),
          metadata: event.payload.metadata,
        }),
      );
      await outbox.markPublished(entry.id);
    }
  };

  it('rejects unauthenticated requests', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/messages',
      payload: { conversationId: 'c1', content: 'hi' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects empty content via the validation pipe', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/messages',
      token: TOKEN_A,
      payload: { conversationId: 'c1', content: '' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('creates a message, enqueues an outbox row, then projects to search', async () => {
    const before = writer.committed;

    const res = await inject({
      method: 'POST',
      url: '/api/messages',
      token: TOKEN_A,
      payload: { conversationId: 'c1', content: 'hello world' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { id: string; conversationId: string; senderId: string };
    expect(body.conversationId).toBe('c1');
    expect(body.senderId).toBe('user:tenant-a');

    expect(writer.committed).toBe(before + 1);
    expect(writer.rolledBack).toBe(0);
    expect(outbox.entries).toHaveLength(1);
    expect(outbox.entries[0].topic).toBe('messages.created');
    expect(outbox.entries[0].status).toBe('pending');

    await drainOutbox();
    expect(outbox.entries[0].status).toBe('published');
    expect(searchRepo.docs.map((d) => d.content)).toContain('hello world');
  });

  it('lists messages with pagination order', async () => {
    await inject({
      method: 'POST',
      url: '/api/messages',
      token: TOKEN_A,
      payload: { conversationId: 'c1', content: 'second' },
    });
    await drainOutbox();

    const res = await inject({
      method: 'GET',
      url: '/api/conversations/c1/messages?limit=10&sort=desc',
      token: TOKEN_A,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: Array<{ content: string }> };
    expect(body.items.map((i) => i.content)).toEqual(['second', 'hello world']);
  });

  it('isolates tenants on list', async () => {
    const res = await inject({
      method: 'GET',
      url: '/api/conversations/c1/messages',
      token: TOKEN_B,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: unknown[] };
    expect(body.items).toEqual([]);
  });

  it('searches messages via the search repository', async () => {
    const res = await inject({
      method: 'GET',
      url: '/api/conversations/c1/messages/search?q=hello',
      token: TOKEN_A,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { hits: Array<{ content: string }>; total: number };
    expect(body.total).toBe(1);
    expect(body.hits[0].content).toBe('hello world');
  });
});
