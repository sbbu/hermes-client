import { describe, expect, it } from 'vitest'

import { transcriptBackfillFrameCount } from './thread-list'

describe('transcriptBackfillFrameCount', () => {
  it('settles a full pane in at most three prepend commits', () => {
    expect(transcriptBackfillFrameCount()).toBeLessThanOrEqual(3)
  })
})
