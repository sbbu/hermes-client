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

  it('notices same-phase tool progress, argument, result, and error changes', () => {
    const first = {
      type: 'tool-call' as const,
      toolCallId: 'tool-1',
      toolName: 'todo',
      args: { action: 'update', id: 'one' } as never,
      argsText: '{"action":"update","id":"one"}',
      result: { status: 'running', completed: 1 },
      isError: false
    }

    expect(chatPartsEquivalent(first, { ...first, args: { action: 'update', id: 'two' } as never })).toBe(false)
    expect(chatPartsEquivalent(first, { ...first, argsText: '{"action":"update","id":"two"}' })).toBe(false)
    expect(chatPartsEquivalent(first, { ...first, result: { status: 'running', completed: 2 } })).toBe(false)
    expect(chatPartsEquivalent(first, { ...first, isError: true })).toBe(false)
    expect(chatPartsEquivalent(first, { ...first, result: { status: 'running', completed: 1 } })).toBe(true)
  })

  it('notices render-visible message and reasoning metadata changes', () => {
    const original: ChatMessage = {
      id: 'reasoning-1',
      role: 'assistant',
      timestamp: 10,
      attachmentRefs: ['@file:first.txt'],
      parts: [{ type: 'reasoning', text: 'thinking', status: 'running' } as ChatMessage['parts'][number]]
    }

    expect(chatMessagesEquivalent(original, { ...original, timestamp: 11 })).toBe(false)
    expect(chatMessagesEquivalent(original, { ...original, attachmentRefs: ['@file:second.txt'] })).toBe(false)
    expect(
      chatMessagesEquivalent(original, {
        ...original,
        parts: [{ type: 'reasoning', text: 'thinking', status: 'complete' } as ChatMessage['parts'][number]]
      })
    ).toBe(false)
  })

  it('uses identity fast paths but still rejects changed messages', () => {
    const messages = [message('1', 'hello')]

    expect(chatMessageArraysEquivalent(messages, messages)).toBe(true)
    expect(chatMessagesEquivalent(messages[0], message('1', 'hello'))).toBe(true)
    expect(chatMessagesEquivalent(messages[0], message('1', 'goodbye'))).toBe(false)
  })
})
