import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ── Security hardening ──
  // Basic security headers on every response.
  app.use(helmet());

  // Fail-fast in production on a weak/missing JWT secret — never fall back silently.
  const isProd = process.env.NODE_ENV === 'production';
  const secret = process.env.JWT_SECRET;
  if (isProd && (!secret || secret.length < 32 || /^(dev|ci|test)/i.test(secret))) {
    throw new Error('Refusing to start: production requires a strong JWT_SECRET (>= 32 chars)');
  }

  // CORS: allowlist, not reflect. Set ORIGIN="https://erp.phrama.pk" (comma-separated) in prod.
  const origins = (process.env.ORIGIN ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: origins.length > 0 ? origins : isProd ? false : true,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip unknown fields (mass-assignment guard)
      forbidNonWhitelisted: true, // reject instead of silently dropping
      transform: true,
    }),
  );

  const prisma = app.get(PrismaService);
  await prisma.$connect();

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  new Logger('Bootstrap').log(`API listening on :${port}${isProd ? ' [PROD]' : ''}`);
}
bootstrap();
