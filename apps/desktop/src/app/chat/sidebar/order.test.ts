import { describe, expect, it } from 'vitest'

import { resolveManualSessionOrderIds } from './order'

describe('resolveManualSessionOrderIds', () => {
  it('clears legacy auto-seeded order until the user manually reorders sessions', () => {
    expect(resolveManualSessionOrderIds(['newest', 'older'], ['older', 'newest'], false)).toEqual([])
  })

  it('keeps a manual order and surfaces newly seen sessions first', () => {
    expect(resolveManualSessionOrderIds(['newest', 'older', 'oldest'], ['oldest', 'older'], true)).toEqual([
      'newest',
      'oldest',
      'older'
    ])
  })

  it('clears manual order when none of the saved ids still exist', () => {
    expect(resolveManualSessionOrderIds(['newest'], ['gone'], true)).toEqual([])
  })

  it('keeps a newly loaded older page below the hand-picked order', () => {
    expect(resolveManualSessionOrderIds(['a', 'b', 'old-1', 'old-2'], ['b', 'a'], true)).toEqual([
      'b',
      'a',
      'old-1',
      'old-2'
    ])
  })

  it('splits unknown ids around the retained order by recency position', () => {
    expect(resolveManualSessionOrderIds(['new', 'a', 'b', 'old'], ['b', 'a'], true)).toEqual(['new', 'b', 'a', 'old'])
  })
})
