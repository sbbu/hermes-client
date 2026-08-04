import { describe, expect, it } from 'vitest'

import { resolveShowEarlierAction } from './transcript-window'

describe('resolveShowEarlierAction', () => {
  it('spends DOM pages before expanding the runtime window', () => {
    expect(resolveShowEarlierAction(3, true)).toBe('dom')
    expect(resolveShowEarlierAction(0, true)).toBe('window')
    expect(resolveShowEarlierAction(0, false)).toBe(null)
  })
})
