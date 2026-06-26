import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreateMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  conversationId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  content!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  senderId?: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => Object)
  metadata?: Record<string, unknown>;
}
