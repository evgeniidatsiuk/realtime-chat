import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export type MessageDocument = HydratedDocument<MessageModel>;

@Schema({ collection: 'messages', versionKey: false })
export class MessageModel {
  @Prop({ type: String, required: true, unique: true })
  id!: string;

  @Prop({ type: String, required: true, index: true })
  tenantId!: string;

  @Prop({ type: String, required: true })
  conversationId!: string;

  @Prop({ type: String, required: true })
  senderId!: string;

  @Prop({ type: String, required: true })
  content!: string;

  @Prop({ type: Date, required: true })
  timestamp!: Date;

  @Prop({ type: Object, default: undefined })
  metadata?: Record<string, unknown>;
}

export const MessageSchema = SchemaFactory.createForClass(MessageModel);

// Primary read pattern: list messages in a conversation for a tenant, newest first.
MessageSchema.index({ tenantId: 1, conversationId: 1, timestamp: -1, id: 1 });
// Tenant + id lookup (e.g. point reads, idempotency checks).
MessageSchema.index({ tenantId: 1, id: 1 }, { unique: true });
