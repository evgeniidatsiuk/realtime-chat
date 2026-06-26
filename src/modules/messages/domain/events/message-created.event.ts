import type { MessageProps } from '../message.entity';

export interface MessageCreatedEvent {
  readonly type: 'message.created';
  readonly occurredAt: string;
  readonly payload: {
    id: string;
    tenantId: string;
    conversationId: string;
    senderId: string;
    content: string;
    timestamp: string;
    metadata?: Record<string, unknown>;
  };
}

export const buildMessageCreatedEvent = (message: MessageProps): MessageCreatedEvent => ({
  type: 'message.created',
  occurredAt: new Date().toISOString(),
  payload: {
    id: message.id,
    tenantId: message.tenantId,
    conversationId: message.conversationId,
    senderId: message.senderId,
    content: message.content,
    timestamp: message.timestamp.toISOString(),
    metadata: message.metadata,
  },
});
