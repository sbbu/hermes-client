import { describe, expect, it } from 'vitest'

import { separateGluedReasoningBlocks } from '@/lib/reasoning-blocks'

describe('separateGluedReasoningBlocks', () => {
  it('splits heading-onto-heading parts', () => {
    expect(separateGluedReasoningBlocks('**One****Two**')).toBe('**One**\n\n**Two**')
  })

  it('splits prose-onto-heading parts', () => {
    expect(separateGluedReasoningBlocks('interaction!**Next heading**')).toBe('interaction!\n\n**Next heading**')
  })

  it('leaves already-separated and inline emphasis alone', () => {
    expect(separateGluedReasoningBlocks('**One**\n\n**Two**')).toBe('**One**\n\n**Two**')
    expect(separateGluedReasoningBlocks('the **signature** field')).toBe('the **signature** field')
  })
})
