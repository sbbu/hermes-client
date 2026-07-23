import type { ChatMessage } from '@/lib/chat-messages'

function structuredValuesEquivalent(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) {
    return true
  }

  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((value, index) => structuredValuesEquivalent(value, b[index]))
    )
  }

  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const aRecord = a as Record<string, unknown>
    const bRecord = b as Record<string, unknown>
    const aKeys = Object.keys(aRecord)
    const bKeys = Object.keys(bRecord)

    return (
      aKeys.length === bKeys.length &&
      aKeys.every(key => Object.hasOwn(bRecord, key) && structuredValuesEquivalent(aRecord[key], bRecord[key]))
    )
  }

  return false
}

export function chatPartsEquivalent(aPart: ChatMessage['parts'][number], bPart: ChatMessage['parts'][number]): boolean {
  if (aPart === bPart) {
    return true
  }

  if (aPart.type !== bPart.type) {
    return false
  }

  return structuredValuesEquivalent(aPart, bPart)
}

export function chatMessagesEquivalent(a: ChatMessage, b: ChatMessage): boolean {
  return a === b || structuredValuesEquivalent(a, b)
}

export function chatMessageArraysEquivalent(a: ChatMessage[], b: ChatMessage[]): boolean {
  if (a === b) {
    return true
  }

  return a.length === b.length && a.every((message, index) => chatMessagesEquivalent(message, b[index]))
}
