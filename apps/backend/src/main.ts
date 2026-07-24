import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import fastifyCookie from '@fastify/cookie';
import fastifyHelmet from '@fastify/helmet';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppModule } from './app.module';
import type { Env } from './config/env.validation';
import { ConfigService } from '@nestjs/config';
import { LocalDiskDriver } from './storage/local-disk.driver';
import { ACCESS_COOKIE } from './modules/auth/jwt.guard';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { REQUEST_ID_HEADER } from './common/request-id';

// Límites de upload: 250 MB por archivo y hasta 12 archivos por request.
const MEGABYTE = 1024 * 1024;
const MAX_UPLOAD_MB = 250;
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * MEGABYTE;
const MAX_FILES_PER_REQUEST = 12;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: false,
      bodyLimit: MAX_UPLOAD_BYTES,
      // Acepta un x-request-id entrante (correlación entre servicios) o genera uno.
      requestIdHeader: REQUEST_ID_HEADER,
      genReqId: (req: IncomingMessage) => {
        const incoming = req.headers[REQUEST_ID_HEADER];
        return (Array.isArray(incoming) ? incoming[0] : incoming) ?? randomUUID();
      },
    }),
  );

  const config = app.get(ConfigService<Env, true>);
  const storage = app.get(LocalDiskDriver);
  const isProd = config.get('NODE_ENV', { infer: true }) === 'production';

  // Devuelve el request-id al cliente para que pueda referenciarlo en soporte/logs.
  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onSend', (req: FastifyRequest, reply: FastifyReply, _payload, done) => {
      reply.header(REQUEST_ID_HEADER, req.id);
      done();
    });

  await app.register(fastifyHelmet, {
    // El CSP por defecto de helmet rompe el Swagger UI (scripts/estilos inline).
    // En dev lo desactivamos (Swagger activo); en prod aplica el CSP estricto por defecto.
    contentSecurityPolicy: isProd,
    // El frontend (otro origen) necesita cargar las imágenes servidas en /uploads.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });

  await app.register(fastifyCookie, {
    secret: config.get<string>('COOKIE_SECRET', { infer: true }),
  });

  await app.register(fastifyMultipart, {
    limits: {
      fileSize: MAX_UPLOAD_BYTES,
      files: MAX_FILES_PER_REQUEST,
    },
  });

  await mkdir(storage.rootPath, { recursive: true });
  await app.register(fastifyStatic, {
    root: storage.rootPath,
    prefix: '/uploads/',
    decorateReply: false,
  });

  app.setGlobalPrefix('api', { exclude: ['health', 'health/db', 'uploads/(.*)'] });
  app.enableCors({
    origin: config.get('CORS_ORIGINS', { infer: true }),
    credentials: true,
  });

  app.useGlobalFilters(new AllExceptionsFilter(isProd));

  if (!isProd) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Journal API')
      .setDescription('Endpoints del trading journal — sondea desde /docs')
      .setVersion('0.1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'bearer')
      .addCookieAuth(ACCESS_COOKIE, { type: 'apiKey', in: 'cookie' }, 'cookie')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  const port = config.get('PORT', { infer: true });
  await app.listen(port, '0.0.0.0');

  // eslint-disable-next-line no-console
  console.log(`[backend] listening on http://localhost:${port}`);
  // eslint-disable-next-line no-console
  console.log(`[backend] storage root: ${storage.rootPath}`);
}

bootstrap().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error('[backend] fatal bootstrap error', err);
  process.exit(1);
});
