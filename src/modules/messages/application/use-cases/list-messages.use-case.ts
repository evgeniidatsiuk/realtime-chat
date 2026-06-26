import { Inject, Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../common/tenant/tenant-context';
import {
  type ListMessagesResult,
  MESSAGE_REPOSITORY,
  type MessageRepository,
} from '../../domain/message.repository';
import type { ListMessagesQueryDto } from '../dto/list-messages.query.dto';

const DEFAULT_LIMIT = 20;

@Injectable()
export class ListMessagesUseCase {
  constructor(
    @Inject(MESSAGE_REPOSITORY) private readonly repository: MessageRepository,
    private readonly tenantContext: TenantContext,
  ) {}

  execute(conversationId: string, query: ListMessagesQueryDto): Promise<ListMessagesResult> {
    const { tenantId } = this.tenantContext.get();
    return this.repository.list({
      tenantId,
      conversationId,
      limit: query.limit ?? DEFAULT_LIMIT,
      cursor: query.cursor,
      sort: query.sort ?? 'desc',
    });
  }
}
