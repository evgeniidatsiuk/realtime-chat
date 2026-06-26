import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { CommonModule } from './common/common.module';
import type { AppConfig } from './common/config/configuration';
import { AllExceptionsFilter } from './common/errors/http-exception.filter';
import { TenantInterceptor } from './common/tenant/tenant.interceptor';
import { MessagesModule } from './modules/messages/messages.module';

@Module({
  imports: [
    CommonModule,
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        uri: config.get('mongoUri', { infer: true }),
      }),
    }),
    MessagesModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: TenantInterceptor },
  ],
})
export class AppModule {}
