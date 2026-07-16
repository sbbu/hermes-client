import { describe, expect, it } from 'vitest'

import type { ChatMessage } from '@/lib/chat-messages'

import { chatMessageArraysEquivalent, chatMessagesEquivalent, chatPartsEquivalent } from './use-session-actions'

const message = (id: string, text: string): ChatMessage => ({
  id,
  role: 'assistant',
  parts: [{ type: 'text', text }]
})

describe('session transcript structural equality', () => {
  it('compares text without serializing the entire part tree', () => {
    expect(chatPartsEquivalent({ type: 'text', text: 'same' }, { type: 'text', text: 'same' })).toBe(true)
    expect(chatPartsEquivalent({ type: 'text', text: 'one' }, { type: 'text', text: 'two' })).toBe(false)
  })

  it('notices when a tool result arrives', () => {
    const pending = {
      type: 'tool-call' as const,
      toolCallId: 'tool-1',
      toolName: 'read_file',
      args: {} as never,
      argsText: '{}'
    }

    const complete = { ...pending, result: { content: 'done' }, isError: false }

    expect(chatPartsEquivalent(pending, complete)).toBe(false)
  })

  it('uses identity fast paths but still rejects changed messages', () => {
    const messages = [message('1', 'hello')]

    expect(chatMessageArraysEquivalent(messages, messages)).toBe(true)
    expect(chatMessagesEquivalent(messages[0], message('1', 'hello'))).toBe(true)
    expect(chatMessagesEquivalent(messages[0], message('1', 'goodbye'))).toBe(false)
  })
})
