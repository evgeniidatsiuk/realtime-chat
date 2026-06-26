import { Client } from '@elastic/elasticsearch';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../../../common/config/configuration';
import type {
  MessageSearchRepository,
  SearchMessagesQuery,
  SearchMessagesResult,
} from '../../domain/message-search.repository';
import { Message } from '../../domain/message.entity';
import { messageMappings, messageSettings } from './message.mapping';

interface MessageDoc {
  id: string;
  tenantId: string;
  conversationId: string;
  senderId: string;
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class ElasticsearchMessageSearchRepository implements MessageSearchRepository {
  private readonly logger = new Logger(ElasticsearchMessageSearchRepository.name);
  private readonly client: Client;
  private readonly indexName: string;

  constructor(config: ConfigService<AppConfig, true>) {
    const esCfg = config.get('elasticsearch', { infer: true });
    this.client = new Client({ node: esCfg.node });
    this.indexName = esCfg.messagesIndex;
  }

  async ensureIndex(): Promise<void> {
    const exists = await this.client.indices.exists({ index: this.indexName });
    if (exists) return;
    await this.client.indices.create({
      index: this.indexName,
      mappings: messageMappings,
      settings: messageSettings,
    });
    this.logger.log(`Created Elasticsearch index "${this.indexName}"`);
  }

  async index(message: Message): Promise<void> {
    const props = message.toJSON();
    const doc: MessageDoc = {
      id: props.id,
      tenantId: props.tenantId,
      conversationId: props.conversationId,
      senderId: props.senderId,
      content: props.content,
      timestamp: props.timestamp.toISOString(),
      metadata: props.metadata,
    };
    await this.client.index({
      index: this.indexName,
      id: `${props.tenantId}:${props.id}`,
      document: doc,
      refresh: false,
    });
  }

  async search(query: SearchMessagesQuery): Promise<SearchMessagesResult> {
    const from = (query.page - 1) * query.pageSize;
    const response = await this.client.search<MessageDoc>({
      index: this.indexName,
      from,
      size: query.pageSize,
      track_total_hits: true,
      query: {
        bool: {
          filter: [
            { term: { tenantId: query.tenantId } },
            { term: { conversationId: query.conversationId } },
          ],
          must: [
            {
              match: {
                content: {
                  query: query.term,
                  operator: 'and',
                },
              },
            },
          ],
        },
      },
      highlight: {
        fields: { content: { number_of_fragments: 2, fragment_size: 120 } },
      },
      sort: [{ _score: { order: 'desc' } }, { timestamp: { order: 'desc' } }],
    });

    const totalRaw = response.hits.total;
    const total = typeof totalRaw === 'number' ? totalRaw : (totalRaw?.value ?? 0);

    const hits = response.hits.hits
      .map((hit) => {
        if (!hit._source) return undefined;
        const src = hit._source;
        const message = Message.rehydrate({
          id: src.id,
          tenantId: src.tenantId,
          conversationId: src.conversationId,
          senderId: src.senderId,
          content: src.content,
          timestamp: new Date(src.timestamp),
          metadata: src.metadata,
        });
        return {
          message,
          score: hit._score ?? 0,
          highlights: hit.highlight?.content,
        };
      })
      .filter((h): h is NonNullable<typeof h> => h !== undefined);

    return { hits, total, page: query.page, pageSize: query.pageSize };
  }
}
