import 'reflect-metadata';
import helmet from '@fastify/helmet';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import type { AppConfig } from './common/config/configuration';

const SHUTDOWN_SIGNALS = ['SIGINT', 'SIGTERM'] as const;

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: true, bodyLimit: 1024 * 1024 }),
    { bufferLogs: true },
  );

  await app.register(helmet, { contentSecurityPolicy: false });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Chat Kafka API')
    .setDescription(
      [
        'Multi-tenant messaging service.',
        '',
        '**How to authenticate**',
        '1. Click the green **Authorize** button (top right).',
        '2. Paste a dev token in the `Value` field — **without** the `Bearer ` prefix.',
        '3. Click *Authorize*, then *Close*. All requests now send `Authorization: Bearer <token>`.',
        '',
        '**Dev tokens** (configured in `AUTH_API_TOKENS`):',
        '- `dev-token-tenant-a` → tenant-a',
        '- `dev-token-tenant-b` → tenant-b',
      ].join('\n'),
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'opaque',
        description: 'Paste a dev token, e.g. `dev-token-tenant-a` (no `Bearer ` prefix).',
      },
      'bearer',
    )
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.log(`Received ${signal}, shutting down gracefully...`);
    try {
      await app.close();
      logger.log('Application closed cleanly');
      process.exit(0);
    } catch (err) {
      logger.error('Error during shutdown', err instanceof Error ? err.stack : String(err));
      process.exit(1);
    }
  };
  for (const signal of SHUTDOWN_SIGNALS) {
    process.on(signal, () => void shutdown(signal));
  }
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', reason instanceof Error ? reason.stack : reason);
  });
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', err.stack ?? String(err));
    void shutdown('SIGTERM');
  });

  const config = app.get(ConfigService<AppConfig, true>);
  const port = config.get('port', { infer: true });
  await app.listen({ port, host: '0.0.0.0' });
  logger.log(`Application listening on http://0.0.0.0:${port}`);
  logger.log(`Swagger UI available at http://0.0.0.0:${port}/docs`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal: bootstrap failed', err);
  process.exit(1);
});
