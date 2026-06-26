import type { SearchHit } from '../../domain/message-search.repository';
import type { Message } from '../../domain/message.entity';

export interface MessageView {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export const toMessageView = (message: Message): MessageView => {
  const props = message.toJSON();
  return {
    id: props.id,
    conversationId: props.conversationId,
    senderId: props.senderId,
    content: props.content,
    timestamp: props.timestamp.toISOString(),
    metadata: props.metadata,
  };
};

export interface SearchHitView extends MessageView {
  score: number;
  highlights?: string[];
}

export const toSearchHitView = (hit: SearchHit): SearchHitView => ({
  ...toMessageView(hit.message),
  score: hit.score,
  highlights: hit.highlights,
});
