import { describe, expect, it } from 'vitest'

import { messagePaintWeight, messageStoreWeight, RENDER_WEIGHT_CHARS } from './render-weight'

const bigResult = (chars: number) => ({
  type: 'tool-call',
  toolName: 'skill_view',
  args: { name: 'hermes-agent' },
  result: { content: 'x'.repeat(chars) }
})

describe('messageStoreWeight', () => {
  it('charges large payloads by character cost and bounds enormous payloads', () => {
    const heavy = messageStoreWeight([bigResult(RENDER_WEIGHT_CHARS * 100)])
    const enormous = messageStoreWeight([bigResult(RENDER_WEIGHT_CHARS * 10_000)])

    expect(heavy).toBeGreaterThanOrEqual(101)
    expect(enormous).toBeLessThanOrEqual(302)
  })

  it('handles circular payloads', () => {
    const result: { content: string; self?: unknown } = { content: 'ok' }
    result.self = result
    expect(messageStoreWeight([{ type: 'tool-call', result }])).toBe(2)
  })
})

describe('messagePaintWeight', () => {
  it('prices collapsed activity and reasoning by what they paint', () => {
    const largeTool = [bigResult(RENDER_WEIGHT_CHARS * 100)]
    const thought = [{ type: 'reasoning', text: 'x'.repeat(RENDER_WEIGHT_CHARS * 20) }]

    expect(messagePaintWeight(largeTool)).toBe(messagePaintWeight([bigResult(200)]))
    expect(messagePaintWeight(largeTool)).toBeLessThan(messageStoreWeight(largeTool))
    expect(messagePaintWeight(thought)).toBe(1)
  })

  it('charges visible markdown and file diffs by size', () => {
    const text = [{ type: 'text', text: 'x'.repeat(RENDER_WEIGHT_CHARS * 3) }]
    const diff = Array.from({ length: 400 }, (_, i) => `+line ${i}`).join('\n')
    const patch = [{ type: 'tool-call', toolName: 'patch', args: { path: 'a.ts' }, result: { inline_diff: diff } }]

    expect(messagePaintWeight(text)).toBe(4)
    expect(messagePaintWeight(patch)).toBeGreaterThan(5)
  })

  it('prices image cards flat and silent tools at the floor', () => {
    const card = (chars: number) => [
      {
        type: 'tool-call',
        toolName: 'image_generate',
        args: {},
        result: { image: `data:image/png;base64,${'A'.repeat(chars)}` }
      }
    ]

    const silent = [
      { type: 'tool-call', toolName: 'todo', args: { todos: [] } },
      { type: 'tool-call', toolName: 'react_to_message', args: { emoji: 'ok' } }
    ]

    expect(messagePaintWeight(card(1_000_000))).toBe(messagePaintWeight(card(80)))
    expect(messagePaintWeight(silent)).toBe(1)
  })
})
