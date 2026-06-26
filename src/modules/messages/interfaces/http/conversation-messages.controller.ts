import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../../../common/auth/auth.guard';
import { ListMessagesQueryDto } from '../../application/dto/list-messages.query.dto';
import { SearchMessagesQueryDto } from '../../application/dto/search-messages.query.dto';
import { ListMessagesUseCase } from '../../application/use-cases/list-messages.use-case';
import { SearchMessagesUseCase } from '../../application/use-cases/search-messages.use-case';
import {
  type MessageView,
  type SearchHitView,
  toMessageView,
  toSearchHitView,
} from './message.presenter';

interface ListResponse {
  items: MessageView[];
  nextCursor?: string;
}

interface SearchResponse {
  hits: SearchHitView[];
  total: number;
  page: number;
  pageSize: number;
}

@Controller('/api/conversations/:conversationId/messages')
@UseGuards(AuthGuard)
export class ConversationMessagesController {
  constructor(
    private readonly listMessages: ListMessagesUseCase,
    private readonly searchMessages: SearchMessagesUseCase,
  ) {}

  @Get()
  async list(
    @Param('conversationId') conversationId: string,
    @Query() query: ListMessagesQueryDto,
  ): Promise<ListResponse> {
    const result = await this.listMessages.execute(conversationId, query);
    return {
      items: result.items.map(toMessageView),
      nextCursor: result.nextCursor,
    };
  }

  @Get('search')
  async search(
    @Param('conversationId') conversationId: string,
    @Query() query: SearchMessagesQueryDto,
  ): Promise<SearchResponse> {
    const result = await this.searchMessages.execute(conversationId, query);
    return {
      hits: result.hits.map(toSearchHitView),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    };
  }
}
