import { Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Consumer, Kafka, Producer, logLevel } from 'kafkajs';
import type { AppConfig } from '../../../../common/config/configuration';

@Injectable()
export class KafkaClient implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(KafkaClient.name);
  private readonly kafka: Kafka;
  private readonly producerInstance: Producer;
  private readonly consumerInstances: Consumer[] = [];
  private producerConnected = false;

  constructor(private readonly config: ConfigService<AppConfig, true>) {
    const kafkaCfg = this.config.get('kafka', { infer: true });
    this.kafka = new Kafka({
      clientId: kafkaCfg.clientId,
      brokers: kafkaCfg.brokers,
      logLevel: logLevel.NOTHING,
      retry: { retries: 8 },
    });
    this.producerInstance = this.kafka.producer({
      allowAutoTopicCreation: true,
      idempotent: true,
      maxInFlightRequests: 5,
    });
  }

  async onModuleInit(): Promise<void> {
    await this.producerInstance.connect();
    this.producerConnected = true;
    this.logger.log('Kafka producer connected');
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.allSettled(this.consumerInstances.map((c) => c.disconnect()));
    if (this.producerConnected) {
      await this.producerInstance.disconnect();
    }
  }

  get producer(): Producer {
    return this.producerInstance;
  }

  createConsumer(groupId: string): Consumer {
    const consumer = this.kafka.consumer({
      groupId,
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
      allowAutoTopicCreation: true,
    });
    this.consumerInstances.push(consumer);
    return consumer;
  }
}
