import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../../../common/config/configuration';
import type { MessagePublisher } from '../../application/ports/message-publisher.port';
import type { MessageCreatedEvent } from '../../domain/events/message-created.event';
import { KafkaClient } from './kafka.client';

@Injectable()
export class KafkaMessagePublisher implements MessagePublisher {
  private readonly topic: string;

  constructor(
    private readonly kafkaClient: KafkaClient,
    config: ConfigService<AppConfig, true>,
  ) {
    this.topic = config.get('kafka', { infer: true }).topicMessagesCreated;
  }

  async publishMessageCreated(event: MessageCreatedEvent): Promise<void> {
    await this.kafkaClient.producer.send({
      topic: this.topic,
      messages: [
        {
          // Partition key keeps per-conversation events in order on a single partition.
          key: `${event.payload.tenantId}:${event.payload.conversationId}`,
          value: JSON.stringify(event),
          headers: {
            tenantId: event.payload.tenantId,
            eventType: event.type,
          },
        },
      ],
    });
  }
}
