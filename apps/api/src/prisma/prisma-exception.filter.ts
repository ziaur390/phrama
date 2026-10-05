import { ArgumentsHost, Catch, ExceptionFilter, ConflictException } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Prisma } from '@prisma/client';

/**
 * Maps known Prisma errors to clean HTTP responses.
 * P2002 unique violation -> 409 (duplicate company/product/customer codes etc.)
 * P2025 record not found -> 404
 * Anything else -> 500 with server-side log.
 */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();

    if (exception.code === 'P2002') {
      const fields = ((exception.meta?.target as string[]) ?? []).join(', ');
      const body = new ConflictException(`Already exists: ${fields}`).getResponse() as { statusCode: number; message: string };
      return res.status(body.statusCode).json(body);
    }
    if (exception.code === 'P2025') {
      return res.status(404).json({ statusCode: 404, message: 'Record not found', error: 'Not Found' });
    }

    console.error('[Prisma]', exception.code, exception.message, exception.stack?.slice(0, 400));
    return res.status(500).json({ statusCode: 500, message: 'Internal server error' });
  }
}

export const PrismaExceptionFilterProvider = { provide: APP_FILTER, useClass: PrismaExceptionFilter };
