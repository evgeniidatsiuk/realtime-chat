export interface AppConfig {
  port: number;
  mongoUri: string;
  kafka: {
    brokers: string[];
    clientId: string;
    groupId: string;
    topicMessagesCreated: string;
  };
  elasticsearch: {
    node: string;
    messagesIndex: string;
  };
  auth: {
    tokens: Map<string, string>;
  };
}

const parseTokens = (raw: string | undefined): Map<string, string> => {
  const map = new Map<string, string>();
  if (!raw) return map;
  for (const pair of raw.split(',')) {
    const [token, tenantId] = pair.split(':').map((s) => s.trim());
    if (token && tenantId) map.set(token, tenantId);
  }
  return map;
};

export const loadConfiguration = (): AppConfig => ({
  port: Number.parseInt(process.env.PORT ?? '3000', 10),
  mongoUri: process.env.MONGO_URI ?? 'mongodb://localhost:27017/chat',
  kafka: {
    brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9094').split(',').map((s) => s.trim()),
    clientId: process.env.KAFKA_CLIENT_ID ?? 'chat-app',
    groupId: process.env.KAFKA_GROUP_ID ?? 'message-indexer',
    topicMessagesCreated: process.env.KAFKA_TOPIC_MESSAGES_CREATED ?? 'messages.created',
  },
  elasticsearch: {
    node: process.env.ELASTICSEARCH_NODE ?? 'http://localhost:9200',
    messagesIndex: process.env.ELASTICSEARCH_INDEX ?? 'messages',
  },
  auth: {
    tokens: parseTokens(process.env.AUTH_API_TOKENS ?? 'dev-token-tenant-a:tenant-a'),
  },
});
