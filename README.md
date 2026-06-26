# chat-kafka

Production-style RESTful messaging service built with **NestJS 11 + Fastify**, **MongoDB**, **Kafka**, and **Elasticsearch**.

> Tech-test scope: `POST /api/messages`, `GET /api/conversations/:id/messages` (paginated), and `GET /api/conversations/:id/messages/search?q=...` (full-text). Multi-tenant, event-driven, with unit + integration tests.

---

## Quick start

```bash
# 1. Bring up infrastructure (Kafka KRaft, Mongo 7, Elasticsearch 8, Kafka UI)
docker compose up -d kafka mongo elasticsearch kafka-ui

# 2. Install deps (Node >= 24, pnpm)
pnpm install

# 3. Run the app in dev mode
pnpm start:dev

# OR run everything in Docker
docker compose up --build
```

Default endpoints:
- App:           http://localhost:3000
- Kafka UI:      http://localhost:8080
- Elasticsearch: http://localhost:9200
- MongoDB:       mongodb://localhost:27017/chat

Auth tokens (dev): `dev-token-tenant-a` → tenant `tenant-a`, `dev-token-tenant-b` → tenant `tenant-b`.

### Example calls

```bash
# Create a message
curl -X POST http://localhost:3000/api/messages \
  -H "Authorization: Bearer dev-token-tenant-a" \
  -H "Content-Type: application/json" \
  -d '{"conversationId":"c1","content":"hello world"}'

# List (paginated, newest-first by default)
curl "http://localhost:3000/api/conversations/c1/messages?limit=20&sort=desc" \
  -H "Authorization: Bearer dev-token-tenant-a"

# Full-text search
curl "http://localhost:3000/api/conversations/c1/messages/search?q=hello&page=1&pageSize=20" \
  -H "Authorization: Bearer dev-token-tenant-a"
```

---

## Architecture

### Layered DDD per bounded context (`messages`)

```
src/modules/messages/
├── domain/              # entity, repository interfaces (ports), domain events
├── application/         # use cases, DTOs, output ports
├── infrastructure/      # mongo / kafka / elasticsearch adapters
└── interfaces/http/     # controllers + view models
```

* **Domain layer** is framework-free: `Message` enforces invariants (non-empty, length bound, required tenantId/conversationId/senderId). Repository interfaces (`MessageRepository`, `MessageSearchRepository`) and the `MessagePublisher` port are pure TypeScript.
* **Application layer** orchestrates use cases (`CreateMessageUseCase`, `ListMessagesUseCase`, `SearchMessagesUseCase`) and depends on ports via Symbol DI tokens — adapters can be swapped without touching the core.
* **Infrastructure layer** holds Mongoose schemas/repository, KafkaJS client/producer/consumer, and the Elasticsearch search adapter.
* **Interfaces layer** is the HTTP boundary: thin controllers + presenter mappers, kept dumb so the use cases stay testable.

### Event-driven flow

```
HTTP POST /api/messages
  └─► CreateMessageUseCase
        ├─► MessageRepository.save        (Mongo, primary write)
        └─► MessagePublisher.publish      (Kafka topic "messages.created")

Kafka topic "messages.created"
  └─► MessageIndexerConsumer (group "message-indexer")
        └─► MessageSearchRepository.index  (Elasticsearch)
```

The write is **persisted to MongoDB first**, then the event is published. Indexing is **eventually consistent** — `GET /search` reads the projection materialised by the consumer. This decouples write latency from search availability and lets us scale the indexer independently.

### Multi-tenancy

* `Authorization: Bearer <token>` resolves to a tenant via the configured token→tenant map (`AUTH_API_TOKENS`).
* `AuthGuard` produces a `principal` on the request; the `TenantInterceptor` then opens an `AsyncLocalStorage` scope with `{ tenantId, userId }`.
* Every Mongo filter, Kafka event payload, and ES query is constrained by the active `tenantId`. There is no path where a user can read a tenant they do not own — even the controller never accepts a tenant in the body.

### Kafka design

* **Topic:** `messages.created` (configurable). Default 6 partitions (set on the broker).
* **Key:** `${tenantId}:${conversationId}` — preserves ordering per conversation on a single partition while still spreading load across the cluster.
* **Producer:** idempotent (`idempotent: true`, `allowAutoTopicCreation: true`) so retries don't duplicate events.
* **Consumer group:** `message-indexer` — horizontal scaling of indexers comes from running more app replicas; Kafka rebalances partitions automatically.
* **Failure handling:** the consumer logs and absorbs poison messages so a single bad event cannot block the partition. In production this would be paired with a dead-letter topic.

### MongoDB schema & indexes

`messages` collection (one document per message):

```ts
{
  id, tenantId, conversationId, senderId,
  content, timestamp, metadata?
}
```

Indexes:

| Index                                                       | Purpose                                                 |
|-------------------------------------------------------------|---------------------------------------------------------|
| `(tenantId, conversationId, timestamp desc, id asc)`        | Primary list query — keyset pagination, tenant-scoped   |
| `(tenantId, id)` unique                                     | Idempotent upserts + point reads scoped to a tenant     |

Pagination is **cursor-based** (`{timestamp, id}` encoded as base64url). This avoids the `skip + limit` performance cliff on deep pages and works correctly under concurrent inserts.

### Elasticsearch index

Index `messages` with a strict mapping:
* `tenantId`, `conversationId`, `senderId`, `id` → `keyword` (filter-able, no analysis cost)
* `content` → `text` with a custom `message_analyzer` (`lowercase` + `asciifolding` + `stop`)
* `timestamp` → `date`
* `metadata` → `object` with `enabled: false` (stored but not indexed — searching arbitrary nested metadata is not in scope and we don't want a mapping explosion)

Search uses a `bool` query: `must` (match on content with `operator: and`) + `filter` (term filters on `tenantId` + `conversationId`). Filters live in the bool's `filter` clause to avoid scoring overhead. Results are sorted by `_score desc, timestamp desc` and include highlight snippets.

### SOLID notes

* **S**: each class has one reason to change — the use case orchestrates, the repository persists, the publisher sends, the controller adapts HTTP. Domain entity owns invariants only.
* **O**: new adapters (e.g. swap Mongo for Postgres, or Kafka for NATS) plug in via the port interfaces with zero churn in domain/application code.
* **L**: in-memory test adapters in `test/in-memory.adapters.ts` are drop-in substitutes for the production ones — proof the contracts are honoured.
* **I**: `MessagePublisher`, `MessageRepository`, `MessageSearchRepository` are small, focused interfaces — no fat "do everything" ports.
* **D**: every cross-layer dependency is on an abstraction (Symbol DI token). Domain depends on nothing; application depends only on its own ports; infrastructure implements those ports.

### Code quality tooling

* **Biome** for lint + format (replaces ESLint + Prettier).
* **nestjs-doctor** for DI / SOLID / module-structure validation. Current score: **97/100**.
* **Jest** for unit tests; **Jest + Fastify `.inject`** for e2e tests (no live infra required — adapters are swapped for in-memory fakes).

---

## Commands

```bash
pnpm start:dev      # watch mode
pnpm build          # nest build
pnpm test           # unit tests (src/**/*.spec.ts)
pnpm test:e2e       # API integration tests (test/*.e2e-spec.ts)
pnpm lint           # biome lint --write
pnpm format         # biome format --write
pnpm check          # biome lint + format + organize imports
pnpm exec nestjs-doctor   # static health report
```

## Environment variables

| Var                            | Default                                | Notes                                    |
|--------------------------------|----------------------------------------|------------------------------------------|
| `PORT`                         | `3000`                                 |                                          |
| `MONGO_URI`                    | `mongodb://localhost:27017/chat`       |                                          |
| `KAFKA_BROKERS`                | `localhost:9094`                       | Comma-separated                          |
| `KAFKA_CLIENT_ID`              | `chat-app`                             |                                          |
| `KAFKA_GROUP_ID`               | `message-indexer`                      |                                          |
| `KAFKA_TOPIC_MESSAGES_CREATED` | `messages.created`                     |                                          |
| `ELASTICSEARCH_NODE`           | `http://localhost:9200`                |                                          |
| `ELASTICSEARCH_INDEX`          | `messages`                             |                                          |
| `AUTH_API_TOKENS`              | `dev-token-tenant-a:tenant-a`          | `token:tenant,token:tenant`              |

---

## Trade-offs & what I'd add next

* **Outbox pattern**: today the write to Mongo and the publish to Kafka are not atomic. A transactional outbox collection (or change-streams) would close that gap for stricter delivery guarantees.
* **Dead-letter topic**: poison-message handling currently logs and drops; a DLT would let ops re-drive failures.
* **Caching**: hot conversations could go through a Redis cache in front of the list endpoint.
* **Real auth**: tokens are config-loaded for the test. Production would use JWT/OIDC with proper key rotation; the `AuthGuard` boundary is already isolated so the swap is local.
* **Telemetry**: OpenTelemetry traces around the HTTP → Kafka → ES path would make causal debugging trivial.
