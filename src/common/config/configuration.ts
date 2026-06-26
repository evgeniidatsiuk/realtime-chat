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
  outbox: {
    enabled: boolean;
    pollIntervalMs: number;
    batchSize: number;
    leaseMs: number;
    maxAttempts: number;
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

const parseIntEnv = (raw: string | undefined, fallback: number): number => {
  const n = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(n) ? n : fallback;
};

export const loadConfiguration = (): AppConfig => ({
  port: parseIntEnv(process.env.PORT, 3000),
  mongoUri:
    process.env.MONGO_URI ?? 'mongodb://localhost:27017/chat?replicaSet=rs0&directConnection=true',
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
  outbox: {
    enabled: (process.env.OUTBOX_ENABLED ?? 'true') !== 'false',
    pollIntervalMs: parseIntEnv(process.env.OUTBOX_POLL_INTERVAL_MS, 500),
    batchSize: parseIntEnv(process.env.OUTBOX_BATCH_SIZE, 50),
    leaseMs: parseIntEnv(process.env.OUTBOX_LEASE_MS, 30_000),
    maxAttempts: parseIntEnv(process.env.OUTBOX_MAX_ATTEMPTS, 10),
  },
  auth: {
    tokens: parseTokens(process.env.AUTH_API_TOKENS ?? 'dev-token-tenant-a:tenant-a'),
  },
});
