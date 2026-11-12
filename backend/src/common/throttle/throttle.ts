import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';

const isProd = () => process.env.NODE_ENV === 'production';

/**
 * Requests per minute per client. Development/e2e runs log in hundreds of
 * times from one machine, so the defaults are higher there; override with
 * THROTTLE_LIMIT / THROTTLE_AUTH_LIMIT.
 */
export const globalLimit = () =>
  Number(process.env.THROTTLE_LIMIT) || (isProd() ? 300 : 5000);
export const authLimit = () =>
  Number(process.env.THROTTLE_AUTH_LIMIT) || (isProd() ? 10 : 500);
export const THROTTLE_TTL = 60_000;

/** First address of X-Forwarded-For, i.e. the browser behind Next.js/Render. */
export function clientIp(req: Pick<Request, 'headers' | 'ip'>): string {
  const xff = req.headers['x-forwarded-for'];
  const first = (Array.isArray(xff) ? xff[0] : xff)?.split(',')[0]?.trim();
  return first || req.ip || 'unknown';
}

/**
 * Throttles by the real client IP. Login and registration reach the API
 * through the Next.js server, which forwards the browser's address in
 * X-Forwarded-For — without this every user would share the server's quota.
 * WebSocket handlers are not throttled here.
 */
@Injectable()
export class ClientIpThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, unknown>): Promise<string> {
    return Promise.resolve(clientIp(req as unknown as Request));
  }

  canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return Promise.resolve(true);
    return super.canActivate(context);
  }
}
