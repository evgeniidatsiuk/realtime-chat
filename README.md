Multi-tenant messaging service. NestJS 11 on Fastify, MongoDB as the source of truth, Kafka as the event bus, Elasticsearch as the search projection.

---

## Running locally

Requires Node 24+ and pnpm.

```bash
# infrastructure (Kafka KRaft, Mongo replica set, Elasticsearch, Kafka UI)
docker compose up -d kafka mongo elasticsearch kafka-ui

# app
pnpm install
pnpm start:dev
```

To run everything inside Docker:

```bash
docker compose up --build
```

| Service       | URL                                   |
|---------------|---------------------------------------|
| App           | http://localhost:3000                 |
| Kafka UI      | http://localhost:8080                 |
| Elasticsearch | http://localhost:9200                 |
| Mongo         | mongodb://localhost:27017/chat (rs0)  |

Default dev tokens are configured in `docker-compose.yml`:

| Token                  | Tenant     |
|------------------------|------------|
| `dev-token-tenant-a`   | `tenant-a` |
| `dev-token-tenant-b`   | `tenant-b` |

---

## API

All endpoints require `Authorization: Bearer <token>`. The tenant is derived from the token; clients never pass a tenant id in the body or path.

### `POST /api/messages`

```bash
curl -X POST http://localhost:3000/api/messages \
  -H "Authorization: Bearer dev-token-tenant-a" \
  -H "Content-Type: application/json" \
  -d '{"conversationId":"c1","content":"hello world"}'
```

Body:

```ts
{
  conversationId: string;   // required, max 128
  content: string;          // required, 1..8000
  senderId?: string;        // defaults to the principal user id
  metadata?: object;        // free-form, stored alongside the message
}
```

Response: the created message view.

### `GET /api/conversations/:conversationId/messages`

Cursor-paginated list, newest-first by default.

```
?limit=20            # 1..100, default 20
?sort=asc|desc       # default desc
?cursor=<opaque>     # nextCursor returned by the previous page
```

### `GET /api/conversations/:conversationId/messages/search`

```
?q=<term>            # required
?page=1              # 1..1000
?pageSize=20         # 1..100
```

Returns hits with `score`, `highlights`, and a `total`.

---

## Architecture

### Modules

```
src/
├── common/                 # config, kafka client, auth guard, tenant context, error filter
└── modules/
    ├── messages/           # bounded context: messages, conversations
    │   ├── domain/                 # entity, repository ports, domain events
    │   ├── application/            # use cases, DTOs, publisher port
    │   ├── infrastructure/         # mongo / outbox-publisher / es / kafka-consumer adapters
    │   └── interfaces/http/        # controllers + presenters
    └── outbox/             # transactional outbox shared infrastructure
        ├── domain/                 # OutboxEntry, OutboxRepository, TransactionalWriter
        ├── application/            # OutboxPoller (background)
        └── infrastructure/
            ├── persistence/        # mongo adapter + ALS-backed session context
            └── messaging/          # generic Kafka publisher
```

Cross-cutting flow:

```
POST /api/messages
  ╔═══════════════════ Mongo transaction ═══════════════════╗
  ║ MessageRepository.save        ─► messages collection    ║
  ║ MessagePublisher.publish      ─► outbox collection      ║
  ╚═════════════════════════════════════════════════════════╝

OutboxPoller (in-process, single tick every OUTBOX_POLL_INTERVAL_MS)
  ─► OutboxRepository.claim          (atomic findOneAndUpdate per row)
  ─► KafkaOutboxPublisher.publish    (idempotent producer)
  ─► OutboxRepository.markPublished

Kafka topic "messages.created"
  ─► MessageIndexerConsumer (group "message-indexer")
  ─► ElasticsearchMessageSearchRepository.index
```

### Transactional outbox

`CreateMessageUseCase` opens a Mongo transaction via `TransactionalWriter` and writes the message document plus an `outbox` row in the same commit. If anything fails, both rows roll back together — the system never ends up with a persisted message that has no corresponding event, and never publishes an event for a message that didn't commit.

`OutboxPoller` runs in every app instance. Each tick claims a batch with an atomic `findOneAndUpdate({ status: pending | (publishing AND lease expired) }, { status: publishing, leaseExpiresAt: now+lease })`, sorted by `createdAt`. Two replicas racing on the same row see only one winner per call, so the poller is safe to run horizontally. On publish:

- success → `markPublished` + `publishedAt` (the row becomes eligible for TTL eviction).
- failure → `markFailed`, which either drops the lease (re-queue) or promotes the row to `failed` once `attempts >= OUTBOX_MAX_ATTEMPTS`. `failed` rows stay in the collection for inspection and manual re-drive.

The poller drains until `claim` returns empty, so a write burst is flushed without waiting for the next tick.

### Multi-tenancy

`AuthGuard` validates `Authorization: Bearer …`, resolves the tenant, and attaches the principal to the request. `TenantInterceptor` then opens an `AsyncLocalStorage` scope so every downstream call — Mongo filters, outbox payloads, ES queries — reads the tenant from `TenantContext.get()` rather than threading it through every signature.

A second ALS scope (`TransactionContext`) carries the active Mongo `ClientSession`, so any repository call that runs inside `TransactionalWriter.run(fn)` automatically joins the transaction without taking the session as a parameter.

### Kafka

- Topic: `messages.created` (default 6 partitions; broker is configured with `KAFKA_CFG_NUM_PARTITIONS=6`).
- Partition key: `${tenantId}:${conversationId}` — guarantees per-conversation ordering on a single partition.
- Producer: `idempotent: true`, max in-flight 5. Combined with the outbox, the consumer-side de-dup boils down to "have we already indexed this `id`".
- Consumer group: `message-indexer`. To scale indexing, run more app replicas; Kafka rebalances partitions across them.
- The consumer catches per-message exceptions and logs them. A poison message does not block its partition.

### MongoDB

`messages` collection:

| Index                                                       | Purpose                                                |
|-------------------------------------------------------------|--------------------------------------------------------|
| `(tenantId, conversationId, timestamp desc, id asc)`        | Primary list query — keyset pagination, tenant-scoped  |
| `(tenantId, id)` unique                                     | Idempotent upserts, point reads scoped to a tenant     |

`outbox` collection:

| Index                                          | Purpose                                                       |
|------------------------------------------------|---------------------------------------------------------------|
| `(status, createdAt)`                          | Drives the poller's claim query, bounds scan to recent work   |
| `publishedAt` TTL (7 days)                     | Reaps successfully-delivered rows; failed rows are preserved  |

List pagination is cursor-based: the cursor encodes `{timestamp, id}` as base64url and the query uses a keyset predicate. Skip/limit is intentionally avoided — it doesn't scale on deep pages and skips/repeats rows under concurrent inserts.

A single-node replica set (`rs0`) is required because Mongo transactions only work on replica sets. The container is configured for primary-only RS via the bitnami image.

### Elasticsearch

Index `messages`, strict mapping:

- `id`, `tenantId`, `conversationId`, `senderId` → `keyword`
- `content` → `text` with a custom `message_analyzer` (`standard` tokenizer + `lowercase` + `asciifolding` + `stop`)
- `timestamp` → `date`
- `metadata` → `object` with `enabled: false` (stored but not indexed; arbitrary nested keys would otherwise blow up the mapping)

Search query: `bool` with `must: match(content, operator: and)` and `filter: term(tenantId), term(conversationId)`. Filters sit in `filter` so they don't contribute to scoring. Hits are sorted by `_score desc, timestamp desc` and returned with highlight snippets.

### Security

- All endpoints behind `AuthGuard`; missing/invalid bearer → 401.
- `ValidationPipe` runs globally with `whitelist`, `forbidNonWhitelisted`, and `transform` — unknown fields are rejected, types are coerced from query strings.
- `@fastify/helmet` is registered for HTTP headers.
- Content is trimmed and length-bounded at the domain layer. The API is JSON-only and content is stored verbatim; no template rendering happens server-side.
- Tenant isolation is enforced at the repository and search layers — there is no codepath where a query is issued without the tenant filter from `TenantContext`.

---

## Commands

```bash
pnpm start:dev               # watch mode
pnpm build                   # nest build
pnpm test                    # unit tests
pnpm test:e2e                # API integration tests (Fastify .inject + in-memory adapters)
pnpm lint                    # biome lint --write
pnpm format                  # biome format --write
pnpm check                   # biome check --write (lint + format + organize imports)
pnpm exec nestjs-doctor      # static DI/SOLID/module audit
```

## Configuration

| Variable                          | Default                                                              |
|-----------------------------------|----------------------------------------------------------------------|
| `PORT`                            | `3000`                                                               |
| `MONGO_URI`                       | `mongodb://localhost:27017/chat?replicaSet=rs0&directConnection=true`|
| `KAFKA_BROKERS`                   | `localhost:9094` (comma-separated)                                   |
| `KAFKA_CLIENT_ID`                 | `chat-app`                                                           |
| `KAFKA_GROUP_ID`                  | `message-indexer`                                                    |
| `KAFKA_TOPIC_MESSAGES_CREATED`    | `messages.created`                                                   |
| `ELASTICSEARCH_NODE`              | `http://localhost:9200`                                              |
| `ELASTICSEARCH_INDEX`             | `messages`                                                           |
| `OUTBOX_ENABLED`                  | `true`                                                               |
| `OUTBOX_POLL_INTERVAL_MS`         | `500`                                                                |
| `OUTBOX_BATCH_SIZE`               | `50`                                                                 |
| `OUTBOX_LEASE_MS`                 | `30000`                                                              |
| `OUTBOX_MAX_ATTEMPTS`             | `10`                                                                 |
| `AUTH_API_TOKENS`                 | `dev-token-tenant-a:tenant-a` (`token:tenant,token:tenant`)          |
