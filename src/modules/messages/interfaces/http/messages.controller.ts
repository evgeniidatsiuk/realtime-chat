import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../../../common/auth/auth.guard';
import { CreateMessageDto } from '../../application/dto/create-message.dto';
import { CreateMessageUseCase } from '../../application/use-cases/create-message.use-case';
import { type MessageView, toMessageView } from './message.presenter';

@Controller('/api/messages')
@UseGuards(AuthGuard)
export class MessagesController {
  constructor(private readonly createMessage: CreateMessageUseCase) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateMessageDto): Promise<MessageView> {
    const message = await this.createMessage.execute(dto);
    return toMessageView(message);
  }
}
