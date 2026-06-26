import { randomUUID } from 'node:crypto';

export type MessageMetadata = Record<string, unknown>;

export interface MessageProps {
  id: string;
  tenantId: string;
  conversationId: string;
  senderId: string;
  content: string;
  timestamp: Date;
  metadata?: MessageMetadata;
}

export class Message {
  private constructor(private readonly props: MessageProps) {}

  static create(input: {
    tenantId: string;
    conversationId: string;
    senderId: string;
    content: string;
    metadata?: MessageMetadata;
    id?: string;
    timestamp?: Date;
  }): Message {
    const content = input.content?.trim();
    if (!content) {
      throw new Error('Message content must not be empty');
    }
    if (content.length > 8000) {
      throw new Error('Message content exceeds maximum allowed length (8000 chars)');
    }
    if (!input.conversationId?.trim()) {
      throw new Error('conversationId is required');
    }
    if (!input.tenantId?.trim()) {
      throw new Error('tenantId is required');
    }
    if (!input.senderId?.trim()) {
      throw new Error('senderId is required');
    }
    return new Message({
      id: input.id ?? randomUUID(),
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      senderId: input.senderId,
      content,
      timestamp: input.timestamp ?? new Date(),
      metadata: input.metadata,
    });
  }

  static rehydrate(props: MessageProps): Message {
    return new Message({ ...props });
  }

  get id(): string {
    return this.props.id;
  }
  get tenantId(): string {
    return this.props.tenantId;
  }
  get conversationId(): string {
    return this.props.conversationId;
  }
  get senderId(): string {
    return this.props.senderId;
  }
  get content(): string {
    return this.props.content;
  }
  get timestamp(): Date {
    return this.props.timestamp;
  }
  get metadata(): MessageMetadata | undefined {
    return this.props.metadata;
  }

  toJSON(): MessageProps {
    return { ...this.props };
  }
}
