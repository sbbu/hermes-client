import { describe, expect, it } from 'vitest'

import type { ChatMessage } from '@/lib/chat-messages'
import { RENDER_WEIGHT_CHARS } from '@/lib/render-weight'

import {
  alignToBranchGroup,
  selectTranscriptWindow,
  TRANSCRIPT_WINDOW_BUDGET,
  TRANSCRIPT_WINDOW_MIN_MESSAGES,
  visibleOutsideWindowIds
} from './transcript-window'

const message = (id: string, chars: number, branchGroupId?: string): ChatMessage => ({
  id,
  parts: [{ type: 'text', text: 'x'.repeat(chars) }],
  role: id.startsWith('u') ? 'user' : 'assistant',
  ...(branchGroupId ? { branchGroupId } : {})
})

const transcript = (count: number, chars: number): ChatMessage[] =>
  Array.from({ length: count }, (_, i) => message(`m-${i}`, chars))

describe('selectTranscriptWindow', () => {
  it('preserves an inexpensive transcript and its reference', () => {
    const messages = transcript(50, 100)
    const window = selectTranscriptWindow(messages)
    expect(window).toEqual({ messages, windowed: false })
    expect(window.messages).toBe(messages)
  })

  it('bounds a heavy short transcript by weight', () => {
    const messages = transcript(40, RENDER_WEIGHT_CHARS * 400)
    const window = selectTranscriptWindow(messages)
    expect(window.windowed).toBe(true)
    expect(window.messages.length).toBeLessThan(messages.length)
    expect(window.messages.at(-1)).toBe(messages.at(-1))
  })

  it('keeps more light messages than heavy messages', () => {
    const light = selectTranscriptWindow(transcript(500, 20))
    const heavy = selectTranscriptWindow(transcript(500, RENDER_WEIGHT_CHARS * 40))
    expect(light.messages.length).toBeGreaterThan(heavy.messages.length * 10)
  })

  it('keeps a minimum tail and expands to the full transcript', () => {
    const messages = transcript(80, RENDER_WEIGHT_CHARS * TRANSCRIPT_WINDOW_BUDGET)
    const first = selectTranscriptWindow(messages)
    const second = selectTranscriptWindow(messages, 2)

    expect(first.messages.length).toBeGreaterThanOrEqual(TRANSCRIPT_WINDOW_MIN_MESSAGES)
    expect(second.messages.length).toBeGreaterThan(first.messages.length)
    expect(selectTranscriptWindow(messages, 100).messages).toHaveLength(messages.length)
  })

  it('never cuts through a branch group', () => {
    const heavy = RENDER_WEIGHT_CHARS * 200

    const messages = [
      ...transcript(20, heavy),
      message('a-1', heavy, 'g'),
      message('a-2', heavy, 'g'),
      message('a-3', heavy, 'g'),
      ...transcript(20, heavy).map(item => ({ ...item, id: `tail-${item.id}` }))
    ]

    for (let pages = 1; pages <= 6; pages++) {
      expect([0, 3]).toContain(
        selectTranscriptWindow(messages, pages).messages.filter(m => m.branchGroupId === 'g').length
      )
    }

    expect(alignToBranchGroup(messages, 22)).toBe(20)
  })

  it('does not plateau after branch alignment widens a page', () => {
    const heavy = RENDER_WEIGHT_CHARS * 200

    const messages = [
      ...transcript(20, heavy),
      ...transcript(20, heavy).map(item => ({ ...item, id: `group-${item.id}`, branchGroupId: 'large-group' })),
      ...transcript(20, heavy).map(item => ({ ...item, id: `tail-${item.id}` }))
    ]

    const lengths = [1, 2, 3].map(pages => selectTranscriptWindow(messages, pages).messages.length)

    expect(lengths[1]).toBeGreaterThan(lengths[0])
    expect(lengths[2]).toBeGreaterThan(lengths[1])
  })

  it('preserves only visible branch ids outside the materialized window', () => {
    const messages = transcript(5, 10)

    messages[1] = { ...messages[1], hidden: true }
    expect(visibleOutsideWindowIds(messages, 2)).toEqual(['m-0', 'm-2'])
  })
})
