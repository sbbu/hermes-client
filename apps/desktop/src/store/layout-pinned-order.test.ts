import { beforeEach, describe, expect, it } from 'vitest'

import { $pinnedSessionIds, setPinnedSessionOrder } from './layout'

beforeEach(() => $pinnedSessionIds.set([]))

describe('setPinnedSessionOrder', () => {
  it('applies full and partial reorders without dropping unresolved pins', () => {
    $pinnedSessionIds.set(['loaded-1', 'unresolved', 'loaded-2'])
    setPinnedSessionOrder(['loaded-2', 'loaded-1'])
    expect($pinnedSessionIds.get()).toEqual(['loaded-2', 'unresolved', 'loaded-1'])

    setPinnedSessionOrder(['loaded-1', 'unresolved', 'loaded-2'])
    expect($pinnedSessionIds.get()).toEqual(['loaded-1', 'unresolved', 'loaded-2'])
  })

  it('ignores unpinned ids and preserves identity on no-op input', () => {
    const before = ['a', 'b']
    $pinnedSessionIds.set(before)
    setPinnedSessionOrder(['ghost'])
    expect($pinnedSessionIds.get()).toBe(before)

    setPinnedSessionOrder(['b', 'stranger', 'a'])
    expect($pinnedSessionIds.get()).toEqual(['b', 'a'])
  })
})
