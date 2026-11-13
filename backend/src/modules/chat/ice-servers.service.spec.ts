import { ConfigService } from '@nestjs/config';
import { IceServersService } from './ice-servers.service';

const config = (env: Record<string, string>) =>
  ({ get: (k: string) => env[k] }) as unknown as ConfigService;

const cfAnswer = {
  iceServers: [
    {
      urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.cloudflare.com:53'],
    },
    {
      urls: [
        'turn:turn.cloudflare.com:3478?transport=udp',
        'turn:turn.cloudflare.com:53?transport=udp',
        'turns:turn.cloudflare.com:443?transport=tcp',
      ],
      username: 'u1',
      credential: 'c1',
    },
  ],
};

function mockFetch(...responses: (Response | Error)[]) {
  const fn = jest.fn();
  for (const r of responses)
    fn.mockImplementationOnce(() =>
      r instanceof Error ? Promise.reject(r) : Promise.resolve(r),
    );
  global.fetch = fn;
  return fn;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

const turnUrls = (servers: { urls: string | string[] }[]) =>
  servers.flatMap((s) => (Array.isArray(s.urls) ? s.urls : [s.urls]));

describe('IceServersService', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('nothing configured → STUN only, no network call', async () => {
    const fetchFn = mockFetch();
    const res = await new IceServersService(config({})).get();
    expect(turnUrls(res.iceServers).every((u) => u.startsWith('stun:'))).toBe(
      true,
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('static TURN server from TURN_URLS', async () => {
    const res = await new IceServersService(
      config({
        TURN_URLS: 'turn:turn.example.com:3478, turns:turn.example.com:5349',
        TURN_USERNAME: 'lms',
        TURN_CREDENTIAL: 'secret',
      }),
    ).get();
    expect(res.iceServers).toContainEqual({
      urls: ['turn:turn.example.com:3478', 'turns:turn.example.com:5349'],
      username: 'lms',
      credential: 'secret',
    });
  });

  it('Cloudflare: requests credentials, drops port 53 and provider STUN', async () => {
    const fetchFn = mockFetch(json(cfAnswer, 201));
    const svc = new IceServersService(
      config({
        CLOUDFLARE_TURN_KEY_ID: 'key1',
        CLOUDFLARE_TURN_API_TOKEN: 'tok',
      }),
    );
    const res = await svc.get();
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://rtc.live.cloudflare.com/v1/turn/keys/key1/credentials/generate-ice-servers',
    );
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer tok',
    );
    const urls = turnUrls(res.iceServers);
    expect(urls).toContain('turns:turn.cloudflare.com:443?transport=tcp');
    expect(urls.some((u) => u.includes(':53'))).toBe(false);
    expect(urls.some((u) => u.includes('stun.cloudflare.com'))).toBe(false);
    expect(res.ttl).toBeGreaterThan(0);
  });

  it('caches provider credentials (one request for many calls)', async () => {
    const fetchFn = mockFetch(json(cfAnswer, 201));
    const svc = new IceServersService(
      config({ CLOUDFLARE_TURN_KEY_ID: 'k', CLOUDFLARE_TURN_API_TOKEN: 't' }),
    );
    await Promise.all([svc.get(), svc.get(), svc.get()]);
    await svc.get();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('Metered: GET with the API key, array response', async () => {
    const fetchFn = mockFetch(
      json([
        { urls: 'stun:stun.relay.metered.ca:80' },
        {
          urls: 'turn:global.relay.metered.ca:80',
          username: 'm',
          credential: 'p',
        },
      ]),
    );
    const res = await new IceServersService(
      config({
        METERED_TURN_DOMAIN: 'https://myapp.metered.live/',
        METERED_TURN_API_KEY: 'abc',
      }),
    ).get();
    expect((fetchFn.mock.calls[0] as [string])[0]).toBe(
      'https://myapp.metered.live/api/v1/turn/credentials?apiKey=abc',
    );
    expect(res.iceServers).toContainEqual({
      urls: ['turn:global.relay.metered.ca:80'],
      username: 'm',
      credential: 'p',
    });
  });

  it('provider failure falls back to STUN (+ static) and retries later', async () => {
    const fetchFn = mockFetch(
      new Error('network down'),
      json({ error: 'nope' }, 500),
      json(cfAnswer, 201),
    );
    const svc = new IceServersService(
      config({
        CLOUDFLARE_TURN_KEY_ID: 'k',
        CLOUDFLARE_TURN_API_TOKEN: 't',
        TURN_URLS: 'turn:backup.example.com:3478',
      }),
    );
    const first = await svc.get();
    expect(turnUrls(first.iceServers)).toContain(
      'turn:backup.example.com:3478',
    );
    expect(first.ttl).toBe(60);
    const second = await svc.get();
    expect(turnUrls(second.iceServers)).not.toContain(
      'turns:turn.cloudflare.com:443?transport=tcp',
    );
    const third = await svc.get();
    expect(turnUrls(third.iceServers)).toContain(
      'turns:turn.cloudflare.com:443?transport=tcp',
    );
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });
});
