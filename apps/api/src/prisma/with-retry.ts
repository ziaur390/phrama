import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

/**
 * Run a serializable transaction with retry on P2034 (write conflict / deadlock).
 * Two warehouse operators posting at the same instant is a real scenario —
 * one retries, nobody sees a half-posted document.
 */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      const isConflict = e instanceof PrismaClientKnownRequestError && e.code === 'P2034';
      if (!isConflict || i >= attempts) throw e;
      await new Promise((r) => setTimeout(r, 50 * i));
    }
  }
}
