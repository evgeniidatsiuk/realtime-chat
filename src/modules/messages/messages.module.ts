import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MESSAGE_PUBLISHER } from './application/ports/message-publisher.port';
import { CreateMessageUseCase } from './application/use-cases/create-message.use-case';
import { ListMessagesUseCase } from './application/use-cases/list-messages.use-case';
import { SearchMessagesUseCase } from './application/use-cases/search-messages.use-case';
import { MESSAGE_SEARCH_REPOSITORY } from './domain/message-search.repository';
import { MESSAGE_REPOSITORY } from './domain/message.repository';
import { KafkaMessagePublisher } from './infrastructure/messaging/kafka-message.publisher';
import { KafkaClient } from './infrastructure/messaging/kafka.client';
import { MessageIndexerConsumer } from './infrastructure/messaging/message-indexer.consumer';
import { MessageModel, MessageSchema } from './infrastructure/persistence/message.schema';
import { MongoMessageRepository } from './infrastructure/persistence/mongo-message.repository';
import { ElasticsearchMessageSearchRepository } from './infrastructure/search/es-message-search.repository';
import { ConversationMessagesController } from './interfaces/http/conversation-messages.controller';
import { MessagesController } from './interfaces/http/messages.controller';

@Module({
  imports: [MongooseModule.forFeature([{ name: MessageModel.name, schema: MessageSchema }])],
  controllers: [MessagesController, ConversationMessagesController],
  providers: [
    CreateMessageUseCase,
    ListMessagesUseCase,
    SearchMessagesUseCase,
    KafkaClient,
    MessageIndexerConsumer,
    { provide: MESSAGE_REPOSITORY, useClass: MongoMessageRepository },
    { provide: MESSAGE_PUBLISHER, useClass: KafkaMessagePublisher },
    { provide: MESSAGE_SEARCH_REPOSITORY, useClass: ElasticsearchMessageSearchRepository },
  ],
})
export class MessagesModule {}
