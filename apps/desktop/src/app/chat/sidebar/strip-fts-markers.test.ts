import { describe, expect, it } from 'vitest'

import { stripFtsMarkers } from './index'

describe('stripFtsMarkers', () => {
  it('strips one or more backend highlight markers', () => {
    expect(stripFtsMarkers('...>>>alpha<<< then >>>beta<<<...')).toBe('...alpha then beta...')
  })

  it('leaves ordinary snippets untouched', () => {
    expect(stripFtsMarkers('plain snippet text')).toBe('plain snippet text')
  })
})
