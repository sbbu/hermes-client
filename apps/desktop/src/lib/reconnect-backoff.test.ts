import { describe, expect, it, vi } from 'vitest'

import { reconnectBackoffDelayMs } from './reconnect-backoff'

describe('reconnectBackoffDelayMs', () => {
  it('grows, jitters, caps, and resets through the caller attempt', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5)

    try {
      expect([0, 1, 2].map(attempt => reconnectBackoffDelayMs(attempt))).toEqual([150, 300, 600])
      expect(reconnectBackoffDelayMs(100)).toBe(7_500)
      expect(reconnectBackoffDelayMs(-1)).toBe(150)
      expect(reconnectBackoffDelayMs(0)).toBe(150)
    } finally {
      randomSpy.mockRestore()
    }
  })

  it('can use the full jitter interval', () => {
    const randomSpy = vi.spyOn(Math, 'random')

    try {
      randomSpy.mockReturnValue(0)
      expect(reconnectBackoffDelayMs(3)).toBe(0)
      randomSpy.mockReturnValue(0.999)
      expect(reconnectBackoffDelayMs(3)).toBeCloseTo(2_400 * 0.999, 5)
    } finally {
      randomSpy.mockRestore()
    }
  })
})
