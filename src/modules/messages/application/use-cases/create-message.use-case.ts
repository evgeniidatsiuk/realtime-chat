import { Inject, Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../common/tenant/tenant-context';
import {
  TRANSACTIONAL_WRITER,
  type TransactionalWriter,
} from '../../../outbox/domain/transactional-writer';
import { buildMessageCreatedEvent } from '../../domain/events/message-created.event';
import { Message } from '../../domain/message.entity';
import { MESSAGE_REPOSITORY, type MessageRepository } from '../../domain/message.repository';
import type { CreateMessageDto } from '../dto/create-message.dto';
import { MESSAGE_PUBLISHER, type MessagePublisher } from '../ports/message-publisher.port';

@Injectable()
export class CreateMessageUseCase {
  constructor(
    @Inject(MESSAGE_REPOSITORY) private readonly repository: MessageRepository,
    @Inject(MESSAGE_PUBLISHER) private readonly publisher: MessagePublisher,
    @Inject(TRANSACTIONAL_WRITER) private readonly writer: TransactionalWriter,
    private readonly tenantContext: TenantContext,
  ) {}

  async execute(dto: CreateMessageDto): Promise<Message> {
    const { tenantId, userId } = this.tenantContext.get();
    const message = Message.create({
      tenantId,
      conversationId: dto.conversationId,
      senderId: dto.senderId ?? userId,
      content: dto.content,
      metadata: dto.metadata,
    });

    // The repository write and the outbox enqueue commit together. If either
    // fails the entire unit of work rolls back, so we never leave the system
    // with a persisted message that has no corresponding event.
    await this.writer.run(async () => {
      await this.repository.save(message);
      await this.publisher.publishMessageCreated(buildMessageCreatedEvent(message.toJSON()));
    });

    return message;
  }
}
