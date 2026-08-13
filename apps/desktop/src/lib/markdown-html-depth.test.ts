import { describe, expect, it } from 'vitest'

import { clampHtmlNestingDepth } from './markdown-html-depth'

describe('clampHtmlNestingDepth', () => {
  it('preserves ordinary and shallow markup', () => {
    for (const text of ['<div><b>x</b></div>', '<b>x</b>'.repeat(20_000), '<br>'.repeat(20_000)]) {
      expect(clampHtmlNestingDepth(text)).toBe(text)
    }
  })

  it('escapes opening tags after the safe nesting cap', () => {
    const clamped = clampHtmlNestingDepth('Let' + '<unk>'.repeat(5_000))
    expect(clamped.startsWith('Let<unk>')).toBe(true)
    expect(clamped).toContain('&lt;unk>')
  })
})
