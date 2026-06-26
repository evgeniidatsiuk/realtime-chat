import { Inject, Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../common/tenant/tenant-context';
import {
  MESSAGE_SEARCH_REPOSITORY,
  type MessageSearchRepository,
  type SearchMessagesResult,
} from '../../domain/message-search.repository';
import type { SearchMessagesQueryDto } from '../dto/search-messages.query.dto';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;

@Injectable()
export class SearchMessagesUseCase {
  constructor(
    @Inject(MESSAGE_SEARCH_REPOSITORY)
    private readonly searchRepository: MessageSearchRepository,
    private readonly tenantContext: TenantContext,
  ) {}

  execute(conversationId: string, query: SearchMessagesQueryDto): Promise<SearchMessagesResult> {
    const { tenantId } = this.tenantContext.get();
    return this.searchRepository.search({
      tenantId,
      conversationId,
      term: query.q,
      page: query.page ?? DEFAULT_PAGE,
      pageSize: query.pageSize ?? DEFAULT_PAGE_SIZE,
    });
  }
}
