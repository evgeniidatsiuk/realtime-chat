import type { Message } from './message.entity';

export interface SearchMessagesQuery {
  tenantId: string;
  conversationId: string;
  term: string;
  page: number;
  pageSize: number;
}

export interface SearchHit {
  message: Message;
  score: number;
  highlights?: string[];
}

export interface SearchMessagesResult {
  hits: SearchHit[];
  total: number;
  page: number;
  pageSize: number;
}

export const MESSAGE_SEARCH_REPOSITORY = Symbol('MESSAGE_SEARCH_REPOSITORY');

export interface MessageSearchRepository {
  search(query: SearchMessagesQuery): Promise<SearchMessagesResult>;
  index(message: Message): Promise<void>;
  ensureIndex(): Promise<void>;
}
