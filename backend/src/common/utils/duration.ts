const UNIT_MS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

/** Convert a duration string like "15m", "30d", "1h" to milliseconds. */
export function durationToMs(value: string): number {
  const match = /^(\d+)\s*(ms|s|m|h|d)$/.exec(value.trim());
  if (!match) {
    const asNumber = Number(value);
    return Number.isFinite(asNumber) ? asNumber : 0;
  }
  return Number(match[1]) * UNIT_MS[match[2]];
}
