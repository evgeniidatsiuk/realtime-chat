import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model, QueryFilter, SortOrder } from 'mongoose';
import { Message } from '../../domain/message.entity';
import type {
  ListMessagesQuery,
  ListMessagesResult,
  MessageRepository,
} from '../../domain/message.repository';
import { MessageModel } from './message.schema';

interface CursorPayload {
  t: number; // timestamp ms
  id: string;
}

const encodeCursor = (payload: CursorPayload): string =>
  Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');

const decodeCursor = (cursor: string): CursorPayload | undefined => {
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(json) as CursorPayload;
    if (typeof parsed.t !== 'number' || typeof parsed.id !== 'string') return undefined;
    return parsed;
  } catch {
    return undefined;
  }
};

@Injectable()
export class MongoMessageRepository implements MessageRepository {
  constructor(@InjectModel(MessageModel.name) private readonly model: Model<MessageModel>) {}

  async save(message: Message): Promise<void> {
    const props = message.toJSON();
    await this.model.updateOne(
      { tenantId: props.tenantId, id: props.id },
      { $setOnInsert: props },
      { upsert: true },
    );
  }

  async list(query: ListMessagesQuery): Promise<ListMessagesResult> {
    const sortDir: SortOrder = query.sort === 'asc' ? 1 : -1;
    const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;
    const cmp = sortDir === 1 ? '$gt' : '$lt';
    const filter: QueryFilter<MessageModel> = {
      tenantId: query.tenantId,
      conversationId: query.conversationId,
      ...(cursor
        ? {
            $or: [
              { timestamp: { [cmp]: new Date(cursor.t) } },
              { timestamp: new Date(cursor.t), id: { [cmp]: cursor.id } },
            ],
          }
        : {}),
    };

    const docs = await this.model
      .find(filter)
      .sort({ timestamp: sortDir, id: sortDir })
      .limit(query.limit + 1)
      .lean()
      .exec();

    const hasMore = docs.length > query.limit;
    const page = hasMore ? docs.slice(0, query.limit) : docs;
    const items = page.map((doc) =>
      Message.rehydrate({
        id: doc.id,
        tenantId: doc.tenantId,
        conversationId: doc.conversationId,
        senderId: doc.senderId,
        content: doc.content,
        timestamp: doc.timestamp,
        metadata: doc.metadata,
      }),
    );

    const last = page.at(-1);
    const nextCursor =
      hasMore && last ? encodeCursor({ t: last.timestamp.getTime(), id: last.id }) : undefined;

    return { items, nextCursor };
  }
}
