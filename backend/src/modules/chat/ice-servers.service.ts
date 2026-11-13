import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Shape of RTCIceServer (the DOM type isn't available in Node). */
export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface IceConfig {
  iceServers: IceServer[];
  /** Seconds the credentials stay valid; the browser re-asks after that. */
  ttl: number;
}

const STUN: IceServer = {
  urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'],
};
/** Credential lifetime we ask providers for. */
const PROVIDER_TTL = 24 * 60 * 60;
/** Without short-lived credentials the browser may keep the list longer. */
const STATIC_TTL = 6 * 60 * 60;
const FETCH_TIMEOUT_MS = 5_000;

type Provider = 'cloudflare' | 'metered' | null;

/**
 * ICE servers for WebRTC calls. A TURN relay lets calls connect behind
 * strict NATs (mobile networks, corporate Wi-Fi). Provider secrets stay on
 * the server: the browser gets short-lived TURN credentials only.
 *
 * Providers, by env:
 * - Cloudflare Realtime TURN: CLOUDFLARE_TURN_KEY_ID + CLOUDFLARE_TURN_API_TOKEN
 * - Metered: METERED_TURN_DOMAIN + METERED_TURN_API_KEY
 * - any TURN server with fixed credentials: TURN_URLS, TURN_USERNAME, TURN_CREDENTIAL
 * Nothing configured → STUN only. A provider outage never breaks a call:
 * we fall back to STUN (plus the static server, if any).
 */
@Injectable()
export class IceServersService {
  private readonly logger = new Logger(IceServersService.name);
  private cache: { servers: IceServer[]; expiresAt: number } | null = null;
  private pending: Promise<IceServer[] | null> | null = null;

  constructor(private config: ConfigService) {}

  private get provider(): Provider {
    if (
      this.config.get<string>('CLOUDFLARE_TURN_KEY_ID') &&
      this.config.get<string>('CLOUDFLARE_TURN_API_TOKEN')
    )
      return 'cloudflare';
    if (
      this.config.get<string>('METERED_TURN_DOMAIN') &&
      this.config.get<string>('METERED_TURN_API_KEY')
    )
      return 'metered';
    return null;
  }

  /** Fixed TURN server from TURN_URLS / TURN_USERNAME / TURN_CREDENTIAL. */
  private staticServer(): IceServer | null {
    const urls = (this.config.get<string>('TURN_URLS') ?? '')
      .split(',')
      .map((u) => u.trim())
      .filter(Boolean);
    if (!urls.length) return null;
    return {
      urls,
      username: this.config.get<string>('TURN_USERNAME') || undefined,
      credential: this.config.get<string>('TURN_CREDENTIAL') || undefined,
    };
  }

  async get(): Promise<IceConfig> {
    const fixed = this.staticServer();
    const base = fixed ? [STUN, fixed] : [STUN];
    if (!this.provider) {
      return { iceServers: base, ttl: STATIC_TTL };
    }
    const now = Date.now();
    if (this.cache && this.cache.expiresAt > now) {
      return {
        iceServers: [STUN, ...this.cache.servers, ...(fixed ? [fixed] : [])],
        ttl: Math.floor((this.cache.expiresAt - now) / 1000),
      };
    }
    // One request to the provider at a time, however many callers.
    this.pending ??= this.fetchProvider().finally(() => {
      this.pending = null;
    });
    const servers = await this.pending;
    if (!servers) {
      // Provider down: don't cache, try again on the next call.
      return { iceServers: base, ttl: 60 };
    }
    // Hand out credentials while they still have at least half their life.
    this.cache = { servers, expiresAt: now + (PROVIDER_TTL / 2) * 1000 };
    return {
      iceServers: [STUN, ...servers, ...(fixed ? [fixed] : [])],
      ttl: PROVIDER_TTL / 2,
    };
  }

  private async fetchProvider(): Promise<IceServer[] | null> {
    const provider = this.provider;
    try {
      const servers =
        provider === 'cloudflare'
          ? await this.cloudflare()
          : provider === 'metered'
            ? await this.metered()
            : [];
      // STUN entries from the provider are redundant with ours; keep TURN.
      const turn = servers
        .map(withoutBlockedUrls)
        .filter((s): s is IceServer => s !== null && hasTurn(s));
      if (!turn.length) throw new Error('no TURN servers in the response');
      return turn;
    } catch (err) {
      this.logger.warn(
        `TURN credentials from ${provider} failed, using STUN only: ${(err as Error).message}`,
      );
      return null;
    }
  }

  /** POST …/credentials/generate-ice-servers → 201 { iceServers: [...] }. */
  private async cloudflare(): Promise<IceServer[]> {
    const keyId = this.config.get<string>('CLOUDFLARE_TURN_KEY_ID');
    const token = this.config.get<string>('CLOUDFLARE_TURN_API_TOKEN');
    const res = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId!)}/credentials/generate-ice-servers`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ttl: PROVIDER_TTL }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      },
    );
    if (!res.ok) throw new Error(`Cloudflare responded ${res.status}`);
    const body = (await res.json()) as { iceServers?: unknown };
    return toServers(body.iceServers);
  }

  /** GET https://<app>.metered.live/api/v1/turn/credentials?apiKey=… → [...]. */
  private async metered(): Promise<IceServer[]> {
    const domain = this.config
      .get<string>('METERED_TURN_DOMAIN')!
      .replace(/^https?:\/\//, '')
      .replace(/\/+$/, '');
    const key = this.config.get<string>('METERED_TURN_API_KEY')!;
    const res = await fetch(
      `https://${domain}/api/v1/turn/credentials?apiKey=${encodeURIComponent(key)}`,
      { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
    );
    if (!res.ok) throw new Error(`Metered responded ${res.status}`);
    return toServers(await res.json());
  }
}

function toServers(value: unknown): IceServer[] {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return list.filter(
    (s): s is IceServer =>
      typeof s === 'object' &&
      s !== null &&
      (typeof (s as IceServer).urls === 'string' ||
        Array.isArray((s as IceServer).urls)),
  );
}

const urlsOf = (s: IceServer) => (Array.isArray(s.urls) ? s.urls : [s.urls]);

function hasTurn(s: IceServer): boolean {
  return urlsOf(s).some((u) => /^turns?:/i.test(u));
}

/**
 * Cloudflare also lists port 53, which browsers block (the URL just times
 * out). Drop those; a server left without URLs is dropped entirely.
 */
function withoutBlockedUrls(s: IceServer): IceServer | null {
  const urls = urlsOf(s).filter((u) => !/:53(\?|$)/.test(u));
  return urls.length ? { ...s, urls } : null;
}
