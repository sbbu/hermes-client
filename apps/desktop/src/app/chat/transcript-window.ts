import type { ChatMessage } from '@/lib/chat-messages'
import { messageStoreWeight } from '@/lib/render-weight'

export const TRANSCRIPT_WINDOW_BUDGET = 1200
export const TRANSCRIPT_WINDOW_MIN_MESSAGES = 30

export interface TranscriptWindow {
  messages: ChatMessage[]
  windowed: boolean
}

/** Keep old branch visibility stable when assistant-ui reports only a tail window. */
export function visibleOutsideWindowIds(messages: readonly ChatMessage[], windowLength: number): string[] {
  return messages
    .slice(0, Math.max(0, messages.length - windowLength))
    .filter(message => !message.hidden)
    .map(message => message.id)
}

export function alignToBranchGroup(messages: readonly ChatMessage[], start: number): number {
  if (start <= 0 || start >= messages.length) {
    return Math.max(0, Math.min(start, messages.length))
  }

  const group = messages[start].branchGroupId

  if (!group) {
    return start
  }

  let aligned = start

  while (aligned > 0 && messages[aligned - 1].branchGroupId === group) {
    aligned--
  }

  return aligned
}

/** Keep only the newest render-weight pages before building assistant-ui state. */
export function selectTranscriptWindow(messages: readonly ChatMessage[], pages = 1): TranscriptWindow {
  if (messages.length === 0) {
    return { messages: messages as ChatMessage[], windowed: false }
  }

  const pageCount = Math.max(1, Math.floor(pages))
  const minimumStart = Math.max(0, messages.length - TRANSCRIPT_WINDOW_MIN_MESSAGES)
  let minimumWeight = 0

  for (let i = minimumStart; i < messages.length; i++) {
    minimumWeight += messageStoreWeight(messages[i].parts)
  }

  // The first page is whichever is larger: one normal budget or the mandatory
  // message floor.
  const firstBudget = Math.max(TRANSCRIPT_WINDOW_BUDGET, minimumWeight)
  let start = messages.length
  let weight = 0

  for (let i = messages.length - 1; i >= 0; i--) {
    weight += messageStoreWeight(messages[i].parts)
    start = i

    if (weight >= firstBudget && i <= minimumStart) {
      break
    }
  }

  start = alignToBranchGroup(messages, start)

  // Extend from the previous aligned cut one page at a time. Recomputing a
  // single multiplied target can plateau when branch alignment pulled in more
  // than one page for free; this guarantees every click reveals older content.
  for (let page = 1; page < pageCount && start > 0; page++) {
    let pageWeight = 0
    let nextStart = start

    for (let i = start - 1; i >= 0; i--) {
      pageWeight += messageStoreWeight(messages[i].parts)
      nextStart = i

      if (pageWeight >= TRANSCRIPT_WINDOW_BUDGET) {
        break
      }
    }

    start = alignToBranchGroup(messages, nextStart)
  }

  return start <= 0
    ? { messages: messages as ChatMessage[], windowed: false }
    : { messages: messages.slice(start), windowed: true }
}

/** How far a sticky transcript cut may grow before it is recalculated. */
export const TRANSCRIPT_WINDOW_SLACK = TRANSCRIPT_WINDOW_BUDGET / 2

export interface TranscriptWindowState {
  anchorId: null | string
  pages: number
  window: TranscriptWindow
}

/**
 * Keep the transcript's leading cut stable while the active message streams.
 * Re-cutting on every token shifts every row and turns an O(1) tail update into
 * an O(window) repository rebuild.
 */
export function advanceTranscriptWindow(
  previous: null | TranscriptWindowState,
  messages: readonly ChatMessage[],
  pages = 1
): TranscriptWindowState {
  const pageCount = Math.max(1, Math.floor(pages))

  if (previous && previous.pages === pageCount && messages.length > 0) {
    const start = previous.anchorId === null ? 0 : messages.findIndex(message => message.id === previous.anchorId)

    if (start !== -1) {
      let weight = 0

      for (let i = messages.length - 1; i >= start; i--) {
        weight += messageStoreWeight(messages[i].parts)
      }

      if (weight <= TRANSCRIPT_WINDOW_BUDGET * pageCount + TRANSCRIPT_WINDOW_SLACK) {
        const window: TranscriptWindow =
          start === 0
            ? { messages: messages as ChatMessage[], windowed: previous.anchorId !== null }
            : { messages: messages.slice(start), windowed: true }

        return { anchorId: previous.anchorId, pages: pageCount, window }
      }
    }
  }

  const window = selectTranscriptWindow(messages, pageCount)

  return { anchorId: window.windowed ? window.messages[0].id : null, pages: pageCount, window }
}
