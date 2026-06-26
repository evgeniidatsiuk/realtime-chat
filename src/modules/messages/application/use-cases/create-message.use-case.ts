import { Inject, Injectable, Logger } from '@nestjs/common';
import { TenantContext } from '../../../../common/tenant/tenant-context';
import { buildMessageCreatedEvent } from '../../domain/events/message-created.event';
import { Message } from '../../domain/message.entity';
import { MESSAGE_REPOSITORY, type MessageRepository } from '../../domain/message.repository';
import type { CreateMessageDto } from '../dto/create-message.dto';
import { MESSAGE_PUBLISHER, type MessagePublisher } from '../ports/message-publisher.port';

@Injectable()
export class CreateMessageUseCase {
  private readonly logger = new Logger(CreateMessageUseCase.name);

  constructor(
    @Inject(MESSAGE_REPOSITORY) private readonly repository: MessageRepository,
    @Inject(MESSAGE_PUBLISHER) private readonly publisher: MessagePublisher,
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

    await this.repository.save(message);

    try {
      await this.publisher.publishMessageCreated(buildMessageCreatedEvent(message.toJSON()));
    } catch (error) {
      this.logger.error(
        `Failed to publish message.created for ${message.id}: ${(error as Error).message}`,
      );
      throw error;
    }

    return message;
  }
}
