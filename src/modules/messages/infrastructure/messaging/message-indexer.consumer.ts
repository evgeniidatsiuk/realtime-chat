import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Consumer } from 'kafkajs';
import type { AppConfig } from '../../../../common/config/configuration';
import type { MessageCreatedEvent } from '../../domain/events/message-created.event';
import {
  MESSAGE_SEARCH_REPOSITORY,
  type MessageSearchRepository,
} from '../../domain/message-search.repository';
import { Message } from '../../domain/message.entity';
import { KafkaClient } from './kafka.client';

@Injectable()
export class MessageIndexerConsumer implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(MessageIndexerConsumer.name);
  private consumer?: Consumer;
  private readonly topic: string;
  private readonly groupId: string;

  constructor(
    private readonly kafkaClient: KafkaClient,
    @Inject(MESSAGE_SEARCH_REPOSITORY) private readonly searchRepo: MessageSearchRepository,
    config: ConfigService<AppConfig, true>,
  ) {
    const kafkaCfg = config.get('kafka', { infer: true });
    this.topic = kafkaCfg.topicMessagesCreated;
    this.groupId = kafkaCfg.groupId;
  }

  async onModuleInit(): Promise<void> {
    await this.searchRepo.ensureIndex();
    this.consumer = this.kafkaClient.createConsumer(this.groupId);
    await this.consumer.connect();
    await this.consumer.subscribe({ topic: this.topic, fromBeginning: false });
    await this.consumer.run({
      autoCommit: true,
      eachMessage: async ({ message }) => {
        if (!message.value) return;
        try {
          const event = JSON.parse(message.value.toString('utf8')) as MessageCreatedEvent;
          if (event.type !== 'message.created') return;
          const domain = Message.rehydrate({
            id: event.payload.id,
            tenantId: event.payload.tenantId,
            conversationId: event.payload.conversationId,
            senderId: event.payload.senderId,
            content: event.payload.content,
            timestamp: new Date(event.payload.timestamp),
            metadata: event.payload.metadata,
          });
          await this.searchRepo.index(domain);
        } catch (error) {
          // Surface the failure but do not throw — letting Kafka retry the whole
          // partition would block ordering for a single poisoned event.
          this.logger.error(
            `Failed to index message: ${(error as Error).message}`,
            (error as Error).stack,
          );
        }
      },
    });
    this.logger.log(`Subscribed to ${this.topic} as group ${this.groupId}`);
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.consumer) {
      await this.consumer.disconnect();
    }
  }
}
