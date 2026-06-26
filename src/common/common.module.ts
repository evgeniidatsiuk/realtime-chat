import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthGuard } from './auth/auth.guard';
import { loadConfiguration } from './config/configuration';
import { AllExceptionsFilter } from './errors/http-exception.filter';
import { TenantContext } from './tenant/tenant-context';
import { TenantInterceptor } from './tenant/tenant.interceptor';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [loadConfiguration],
      cache: true,
    }),
  ],
  providers: [TenantContext, TenantInterceptor, AuthGuard, AllExceptionsFilter],
  exports: [TenantContext, TenantInterceptor, AuthGuard, AllExceptionsFilter],
})
export class CommonModule {}
