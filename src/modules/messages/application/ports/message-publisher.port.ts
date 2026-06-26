import type { MessageCreatedEvent } from '../../domain/events/message-created.event';

export const MESSAGE_PUBLISHER = Symbol('MESSAGE_PUBLISHER');

export interface MessagePublisher {
  publishMessageCreated(event: MessageCreatedEvent): Promise<void>;
}
