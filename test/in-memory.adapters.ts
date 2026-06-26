import type { MessagePublisher } from '../src/modules/messages/application/ports/message-publisher.port';
import type { MessageCreatedEvent } from '../src/modules/messages/domain/events/message-created.event';
import type {
  MessageSearchRepository,
  SearchMessagesQuery,
  SearchMessagesResult,
} from '../src/modules/messages/domain/message-search.repository';
import type { Message } from '../src/modules/messages/domain/message.entity';
import type {
  ListMessagesQuery,
  ListMessagesResult,
  MessageRepository,
} from '../src/modules/messages/domain/message.repository';

export class InMemoryMessageRepository implements MessageRepository {
  readonly rows: Message[] = [];

  async save(message: Message): Promise<void> {
    const props = message.toJSON();
    const idx = this.rows.findIndex((m) => m.tenantId === props.tenantId && m.id === props.id);
    if (idx === -1) this.rows.push(message);
  }

  async list(query: ListMessagesQuery): Promise<ListMessagesResult> {
    const dir = query.sort === 'asc' ? 1 : -1;
    const filtered = this.rows
      .filter((m) => m.tenantId === query.tenantId && m.conversationId === query.conversationId)
      .sort((a, b) => {
        const ta = a.timestamp.getTime();
        const tb = b.timestamp.getTime();
        if (ta !== tb) return (ta - tb) * dir;
        return a.id < b.id ? -dir : a.id > b.id ? dir : 0;
      });
    const items = filtered.slice(0, query.limit);
    return { items, nextCursor: filtered.length > query.limit ? 'more' : undefined };
  }
}

export class InMemoryMessagePublisher implements MessagePublisher {
  readonly events: MessageCreatedEvent[] = [];
  async publishMessageCreated(event: MessageCreatedEvent): Promise<void> {
    this.events.push(event);
  }
}

export class InMemoryMessageSearchRepository implements MessageSearchRepository {
  readonly docs: Message[] = [];

  async ensureIndex(): Promise<void> {}

  async index(message: Message): Promise<void> {
    this.docs.push(message);
  }

  async search(query: SearchMessagesQuery): Promise<SearchMessagesResult> {
    const term = query.term.toLowerCase();
    const hits = this.docs
      .filter(
        (m) =>
          m.tenantId === query.tenantId &&
          m.conversationId === query.conversationId &&
          m.content.toLowerCase().includes(term),
      )
      .map((message) => ({ message, score: 1, highlights: [message.content] }));
    const start = (query.page - 1) * query.pageSize;
    return {
      hits: hits.slice(start, start + query.pageSize),
      total: hits.length,
      page: query.page,
      pageSize: query.pageSize,
    };
  }
}
