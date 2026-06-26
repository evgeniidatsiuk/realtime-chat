import type { Message } from './message.entity';

export interface ListMessagesQuery {
  tenantId: string;
  conversationId: string;
  limit: number;
  cursor?: string;
  sort: 'asc' | 'desc';
}

export interface ListMessagesResult {
  items: Message[];
  nextCursor?: string;
}

export const MESSAGE_REPOSITORY = Symbol('MESSAGE_REPOSITORY');

export interface MessageRepository {
  save(message: Message): Promise<void>;
  list(query: ListMessagesQuery): Promise<ListMessagesResult>;
}
