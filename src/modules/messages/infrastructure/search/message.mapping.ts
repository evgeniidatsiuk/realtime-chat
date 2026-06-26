import type {
  IndicesIndexSettings,
  MappingTypeMapping,
} from '@elastic/elasticsearch/lib/api/types';

export const messageMappings: MappingTypeMapping = {
  dynamic: 'strict',
  properties: {
    id: { type: 'keyword' },
    tenantId: { type: 'keyword' },
    conversationId: { type: 'keyword' },
    senderId: { type: 'keyword' },
    content: {
      type: 'text',
      analyzer: 'message_analyzer',
      search_analyzer: 'message_analyzer',
      fields: {
        keyword: { type: 'keyword', ignore_above: 256 },
      },
    },
    timestamp: { type: 'date' },
    metadata: { type: 'object', enabled: false },
  },
};

export const messageSettings: IndicesIndexSettings = {
  number_of_shards: 1,
  number_of_replicas: 0,
  analysis: {
    analyzer: {
      message_analyzer: {
        type: 'custom',
        tokenizer: 'standard',
        filter: ['lowercase', 'asciifolding', 'stop'],
      },
    },
  },
};
