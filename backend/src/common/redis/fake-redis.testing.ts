/**
 * Tiny in-memory stand-in for the ioredis commands this app uses, for unit
 * tests (no Redis server needed). Not a general Redis emulator.
 */
export class FakeRedis {
  private strings = new Map<
    string,
    { value: string; expiresAt: number | null }
  >();
  private sets = new Map<string, Set<string>>();
  now = () => Date.now();

  private live(key: string) {
    const entry = this.strings.get(key);
    if (entry && entry.expiresAt !== null && entry.expiresAt <= this.now()) {
      this.strings.delete(key);
      return undefined;
    }
    return entry;
  }

  get(key: string): Promise<string | null> {
    return Promise.resolve(this.live(key)?.value ?? null);
  }

  /** set(key, value, ['EX', s | 'PX', ms], ['NX']) in any order. */
  set(
    key: string,
    value: string,
    ...args: (string | number)[]
  ): Promise<'OK' | null> {
    let ttlMs: number | null = null;
    let nx = false;
    for (let i = 0; i < args.length; i++) {
      const a = String(args[i]).toUpperCase();
      if (a === 'NX') nx = true;
      if (a === 'EX') ttlMs = Number(args[++i]) * 1000;
      if (a === 'PX') ttlMs = Number(args[++i]);
    }
    if (nx && this.live(key)) return Promise.resolve(null);
    this.strings.set(key, {
      value,
      expiresAt: ttlMs === null ? null : this.now() + ttlMs,
    });
    return Promise.resolve('OK');
  }

  del(...keys: string[]): Promise<number> {
    let n = 0;
    for (const k of keys) {
      if (this.strings.delete(k)) n++;
      if (this.sets.delete(k)) n++;
    }
    return Promise.resolve(n);
  }

  incr(key: string): Promise<number> {
    const entry = this.live(key);
    const value = Number(entry?.value ?? 0) + 1;
    this.strings.set(key, {
      value: String(value),
      expiresAt: entry?.expiresAt ?? null,
    });
    return Promise.resolve(value);
  }

  pexpire(key: string, ms: number, mode?: string): Promise<number> {
    const entry = this.live(key);
    if (!entry) return Promise.resolve(0);
    if (mode === 'NX' && entry.expiresAt !== null) return Promise.resolve(0);
    entry.expiresAt = this.now() + ms;
    return Promise.resolve(1);
  }

  expire(key: string, seconds: number): Promise<number> {
    if (this.sets.has(key)) return Promise.resolve(1);
    return this.pexpire(key, seconds * 1000);
  }

  pttl(key: string): Promise<number> {
    const entry = this.live(key);
    if (!entry) return Promise.resolve(-2);
    if (entry.expiresAt === null) return Promise.resolve(-1);
    return Promise.resolve(entry.expiresAt - this.now());
  }

  sadd(key: string, ...members: string[]): Promise<number> {
    const set = this.sets.get(key) ?? new Set<string>();
    members.forEach((m) => set.add(m));
    this.sets.set(key, set);
    return Promise.resolve(members.length);
  }

  smembers(key: string): Promise<string[]> {
    return Promise.resolve([...(this.sets.get(key) ?? [])]);
  }

  multi() {
    const ops: (() => Promise<unknown>)[] = [];
    const chain = {
      sadd: (k: string, ...m: string[]) => (
        ops.push(() => this.sadd(k, ...m)),
        chain
      ),
      expire: (k: string, s: number) => (
        ops.push(() => this.expire(k, s)),
        chain
      ),
      incr: (k: string) => (ops.push(() => this.incr(k)), chain),
      pexpire: (k: string, ms: number, mode?: string) => (
        ops.push(() => this.pexpire(k, ms, mode)),
        chain
      ),
      pttl: (k: string) => (ops.push(() => this.pttl(k)), chain),
      exec: async () => {
        const out: [null, unknown][] = [];
        for (const op of ops) out.push([null, await op()]);
        return out;
      },
    };
    return chain;
  }
}
