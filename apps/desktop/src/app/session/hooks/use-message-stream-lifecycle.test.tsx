import { QueryClient } from '@tanstack/react-query'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { useEffect, useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ClientSessionState } from '@/app/types'
import { chatMessageText } from '@/lib/chat-messages'
import { createClientSessionState } from '@/lib/chat-runtime'
import { $compactingSessions, setSessionCompacting } from '@/store/compaction'
import { $secretRequest, $sudoRequest, clearAllPrompts, setSecretRequest, setSudoRequest } from '@/store/prompts'
import {
  $activeSessionId,
  $currentFastMode,
  $currentModel,
  $currentProvider,
  $currentReasoningEffort,
  $currentServiceTier,
  setCurrentFastMode,
  setCurrentModel,
  setCurrentModelSource,
  setCurrentProvider,
  setCurrentReasoningEffort,
  setCurrentServiceTier
} from '@/store/session'
import type { RpcEvent } from '@/types/hermes'

import { useMessageStream } from './use-message-stream'

const SID = 'session-1'
const OTHER_SID = 'session-2'
let handleEvent: ((event: RpcEvent) => void) | null = null
let sessionStates: Map<string, ClientSessionState> | null = null

function Harness() {
  const activeSessionIdRef = useRef<string | null>(SID)
  const sessionStateByRuntimeIdRef = useRef(new Map<string, ClientSessionState>())
  sessionStates = sessionStateByRuntimeIdRef.current
  const queryClientRef = useRef(new QueryClient())

  const stream = useMessageStream({
    activeSessionIdRef,
    hydrateFromStoredSession: vi.fn(async () => undefined),
    queryClient: queryClientRef.current,
    refreshHermesConfig: vi.fn(async () => undefined),
    refreshSessions: vi.fn(async () => undefined),
    sessionStateByRuntimeIdRef,
    updateSessionState: (sessionId, updater) => {
      const current = sessionStateByRuntimeIdRef.current.get(sessionId) ?? createClientSessionState()
      const next = updater(current)
      sessionStateByRuntimeIdRef.current.set(sessionId, next)

      return next
    }
  })

  useEffect(() => {
    handleEvent = stream.handleGatewayEvent
  }, [stream.handleGatewayEvent])

  return null
}

async function mountStream() {
  render(<Harness />)
  await waitFor(() => expect(handleEvent).not.toBeNull())
}

function emit(type: string, payload: Record<string, unknown> = {}) {
  act(() => handleEvent!({ payload, session_id: SID, type }))
}

describe('useMessageStream lifecycle recovery', () => {
  beforeEach(() => {
    handleEvent = null
    sessionStates = null
    $activeSessionId.set(SID)
    $compactingSessions.set({})
    setCurrentModel('')
    setCurrentProvider('')
    setCurrentReasoningEffort('')
    setCurrentServiceTier('')
    setCurrentFastMode(false)
    setCurrentModelSource('')
    clearAllPrompts()
  })

  afterEach(() => {
    cleanup()
    $activeSessionId.set(null)
    $compactingSessions.set({})
    setCurrentModel('')
    setCurrentProvider('')
    setCurrentReasoningEffort('')
    setCurrentServiceTier('')
    setCurrentFastMode(false)
    setCurrentModelSource('')
    clearAllPrompts()
    vi.restoreAllMocks()
  })

  it.each([
    ['message.delta', { text: 'resumed' }],
    ['thinking.delta', { text: 'still working' }],
    ['reasoning.delta', { text: 'thinking again' }],
    ['tool.start', { name: 'terminal', tool_id: 'tool-1' }]
  ])('clears stale compaction when %s resumes the turn', async (type, payload) => {
    await mountStream()
    setSessionCompacting(OTHER_SID, true)

    emit('status.update', { kind: 'compacting' })
    expect($compactingSessions.get()).toEqual({ [OTHER_SID]: true, [SID]: true })

    emit(type, payload)
    expect($compactingSessions.get()).toEqual({ [OTHER_SID]: true })
  })

  it('dismisses only the matching expired sudo request', async () => {
    await mountStream()
    setSudoRequest({ requestId: 'sudo-new', sessionId: SID })

    emit('sudo.expire', { request_id: 'sudo-old' })
    expect($sudoRequest.get()?.requestId).toBe('sudo-new')

    emit('sudo.expire', { request_id: 'sudo-new' })
    expect($sudoRequest.get()).toBeNull()
  })

  it('dismisses only the matching expired secret request', async () => {
    await mountStream()
    setSecretRequest({ envVar: 'TOKEN', prompt: 'Token', requestId: 'secret-new', sessionId: SID })

    emit('secret.expire', { request_id: 'secret-old' })
    expect($secretRequest.get()?.requestId).toBe('secret-new')

    emit('secret.expire', { request_id: 'secret-new' })
    expect($secretRequest.get()).toBeNull()
  })

  it('does not re-arm a stopped turn from stale running events', async () => {
    await mountStream()
    sessionStates!.set(SID, {
      ...createClientSessionState(),
      busy: false,
      interrupted: true
    })

    emit('session.info', { running: true })
    expect(sessionStates!.get(SID)?.busy).toBe(false)
    expect(sessionStates!.get(SID)?.interrupted).toBe(true)

    emit('message.start')
    expect(sessionStates!.get(SID)?.busy).toBe(false)
    expect(sessionStates!.get(SID)?.interrupted).toBe(true)
  })

  it('preserves interim commentary as a separate bubble before the final answer', async () => {
    await mountStream()

    emit('message.start')
    emit('message.delta', { text: 'Draft commentary' })
    emit('message.interim', { text: 'Draft commentary' })
    emit('message.complete', { text: 'Final answer' })

    const messages = sessionStates!.get(SID)?.messages ?? []
    expect(messages.map(chatMessageText)).toEqual(['Draft commentary', 'Final answer'])
    expect(messages.some(message => message.pending)).toBe(false)
  })

  it('settles a previewed interim prefix in place', async () => {
    await mountStream()

    emit('message.start')
    emit('message.delta', { text: 'Candidate' })
    emit('message.interim', { text: 'Candidate' })
    emit('message.complete', { response_previewed: true, text: 'Candidate plus tail' })

    const messages = sessionStates!.get(SID)?.messages ?? []
    expect(messages).toHaveLength(1)
    expect(chatMessageText(messages[0])).toBe('Candidate plus tail')
  })

  it('settles an identical non-previewed tool-turn interim instead of duplicating it', async () => {
    await mountStream()

    emit('message.start')
    emit('message.interim', { text: 'Same reply' })
    emit('message.complete', { text: 'Same reply' })

    const messages = sessionStates!.get(SID)?.messages ?? []
    expect(messages).toHaveLength(1)
    expect(chatMessageText(messages[0])).toBe('Same reply')
  })

  it('settles a prefix-extended non-previewed tool-turn interim', async () => {
    await mountStream()

    emit('message.start')
    emit('message.delta', { text: 'Partial' })
    emit('message.interim', { text: 'Partial' })
    emit('message.complete', { text: 'Partial answer continued' })

    const messages = sessionStates!.get(SID)?.messages ?? []
    expect(messages).toHaveLength(1)
    expect(chatMessageText(messages[0])).toBe('Partial answer continued')
  })

  it('routes session metadata through the cache without directly writing composer atoms', async () => {
    await mountStream()
    setCurrentModel('manual-model')
    setCurrentProvider('manual-provider')
    setCurrentReasoningEffort('high')
    setCurrentServiceTier('standard')
    setCurrentFastMode(false)
    setCurrentModelSource('manual')

    emit('session.info', {
      fast: true,
      model: 'profile-default',
      provider: 'profile-provider',
      reasoning_effort: 'low',
      service_tier: 'priority'
    })

    expect(sessionStates!.get(SID)).toMatchObject({
      fast: true,
      model: 'profile-default',
      provider: 'profile-provider',
      reasoningEffort: 'low',
      serviceTier: 'priority'
    })
    expect($currentModel.get()).toBe('manual-model')
    expect($currentProvider.get()).toBe('manual-provider')
    expect($currentReasoningEffort.get()).toBe('high')
    expect($currentServiceTier.get()).toBe('standard')
    expect($currentFastMode.get()).toBe(false)
  })
})
