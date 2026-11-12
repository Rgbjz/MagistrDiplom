/** Words the device description needs, taken from the `profile.security` messages. */
export interface DeviceWords {
  unknownDevice: string;
  app: string;
  browser: string;
}

/** "Mozilla/5.0 (Macintosh…) Chrome/…" → "Chrome · macOS". */
export function describeUserAgent(ua: string | null, words: DeviceWords): string {
  if (!ua) return words.unknownDevice;
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : /node|undici|curl/i.test(ua)
              ? words.app
              : words.browser;
  const os = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Mac OS X|Macintosh/.test(ua)
          ? 'macOS'
          : /Windows/.test(ua)
            ? 'Windows'
            : /Linux/.test(ua)
              ? 'Linux'
              : null;
  return os ? `${browser} · ${os}` : browser;
}
