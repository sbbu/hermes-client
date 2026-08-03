export interface ReconnectBackoffOptions {
  capMs?: number
  baseDelayMs?: number
}

const DEFAULT_BASE_DELAY_MS = 300
const DEFAULT_CAP_MS = 15_000

/** Full-jitter exponential delay for gateway reconnect attempt `attempt`. */
export function reconnectBackoffDelayMs(attempt: number, options: ReconnectBackoffOptions = {}): number {
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS
  const capMs = options.capMs ?? DEFAULT_CAP_MS
  const ceiling = Math.min(capMs, baseDelayMs * 2 ** Math.max(0, attempt))

  return Math.random() * ceiling
}
