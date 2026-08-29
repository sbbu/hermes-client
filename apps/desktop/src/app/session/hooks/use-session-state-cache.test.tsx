import { act, cleanup, render } from '@testing-library/react'
import { type MutableRefObject, startTransition, Suspense, useLayoutEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ChatMessage } from '@/lib/chat-messages'
import { $activeGatewayProfile } from '@/store/profile'
import {
  $activeSessionId,
  $activeSessionStoredIdRotation,
  $attentionSessionIds,
  $connection,
  $currentFastMode,
  $currentModel,
  $currentProvider,
  $currentReasoningEffort,
  $currentServiceTier,
  $messages,
  $turnStartedAt,
  $workingSessionIds,
  setActiveSessionStoredIdRotation,
  setCurrentFastMode,
  setCurrentModel,
  setCurrentModelSource,
  setCurrentProvider,
  setCurrentReasoningEffort,
  setCurrentServiceTier,
  setTurnStartedAt
} from '@/store/session'

import { useSessionStateCache } from './use-session-state-cache'

type Cache = ReturnType<typeof useSessionStateCache>

interface HarnessProps {
  activeSessionId: string | null
  onReady: (cache: Cache) => void
  selectedStoredSessionId: string | null
}

function Harness({ activeSessionId, onReady, selectedStoredSessionId }: HarnessProps) {
  const busyRef: MutableRefObject<boolean> = { current: false }

  const cache = useSessionStateCache({
    activeSessionId,
    busyRef,
    selectedStoredSessionId,
    setAwaitingResponse: () => undefined,
    setBusy: () => undefined,
    setMessages: () => undefined
  })

  onReady(cache)

  return null
}

interface LayoutProbeHarnessProps extends HarnessProps {
  onLayoutSnapshot: (snapshot: { active: string | null; selected: string | null }) => void
}

function LayoutProbeHarness({
  activeSessionId,
  onLayoutSnapshot,
  onReady,
  selectedStoredSessionId
}: LayoutProbeHarnessProps) {
  const busyRef: MutableRefObject<boolean> = { current: false }

  const cache = useSessionStateCache({
    activeSessionId,
    busyRef,
    selectedStoredSessionId,
    setAwaitingResponse: () => undefined,
    setBusy: () => undefined,
    setMessages: () => undefined
  })

  onReady(cache)

  useLayoutEffect(() => {
    onLayoutSnapshot({
      active: cache.activeSessionIdRef.current,
      selected: cache.selectedStoredSessionIdRef.current
    })
  })

  return null
}

const neverSettles = new Promise<void>(() => undefined)

function SuspendingHarness({
  activeSessionId,
  onReady,
  selectedStoredSessionId,
  suspend
}: HarnessProps & { suspend: boolean }) {
  const busyRef: MutableRefObject<boolean> = { current: false }

  const cache = useSessionStateCache({
    activeSessionId,
    busyRef,
    selectedStoredSessionId,
    setAwaitingResponse: () => undefined,
    setBusy: () => undefined,
    setMessages: () => undefined
  })

  onReady(cache)

  if (suspend) {
    throw neverSettles
  }

  return <span>{activeSessionId}</span>
}

describe('useSessionStateCache — committed session ref coherence', () => {
  afterEach(() => cleanup())

  it('exposes the new session ids during the layout phase after a switch', () => {
    let cache!: Cache
    const snapshots: Array<{ active: string | null; selected: string | null }> = []

    const { rerender } = render(
      <LayoutProbeHarness
        activeSessionId="runtime-A"
        onLayoutSnapshot={snapshot => snapshots.push(snapshot)}
        onReady={value => (cache = value)}
        selectedStoredSessionId="stored-A"
      />
    )

    void cache
    snapshots.length = 0

    rerender(
      <LayoutProbeHarness
        activeSessionId="runtime-B"
        onLayoutSnapshot={snapshot => snapshots.push(snapshot)}
        onReady={value => (cache = value)}
        selectedStoredSessionId="stored-B"
      />
    )

    expect(snapshots[0]).toEqual({ active: 'runtime-B', selected: 'stored-B' })
  })

  it('preserves an imperative runtime-id pin when the source props do not change', () => {
    let cache!: Cache

    const { rerender } = render(
      <Harness activeSessionId="runtime-A" onReady={value => (cache = value)} selectedStoredSessionId="stored-A" />
    )

    cache.activeSessionIdRef.current = 'runtime-resumed'

    rerender(
      <Harness activeSessionId="runtime-A" onReady={value => (cache = value)} selectedStoredSessionId="stored-A" />
    )

    expect(cache.activeSessionIdRef.current).toBe('runtime-resumed')

    rerender(
      <Harness activeSessionId="runtime-B" onReady={value => (cache = value)} selectedStoredSessionId="stored-B" />
    )

    expect(cache.activeSessionIdRef.current).toBe('runtime-B')
  })

  it('does not expose ids from a suspended, uncommitted session switch', () => {
    let cache!: Cache

    const view = render(
      <Suspense fallback={<span>loading</span>}>
        <SuspendingHarness
          activeSessionId="runtime-A"
          onReady={value => (cache = value)}
          selectedStoredSessionId="stored-A"
          suspend={false}
        />
      </Suspense>
    )

    cache.activeSessionIdRef.current = 'runtime-resumed'

    act(() => {
      startTransition(() => {
        view.rerender(
          <Suspense fallback={<span>loading</span>}>
            <SuspendingHarness
              activeSessionId="runtime-B"
              onReady={() => undefined}
              selectedStoredSessionId="stored-B"
              suspend
            />
          </Suspense>
        )
      })
    })

    expect(view.getByText('runtime-A')).toBeTruthy()
    expect(cache.activeSessionIdRef.current).toBe('runtime-resumed')
    expect(cache.selectedStoredSessionIdRef.current).toBe('stored-A')
  })
})

describe('useSessionStateCache — per-session turn timer', () => {
  beforeEach(() => {
    // The view-sync flush runs on a real rAF in the browser path; in jsdom we
    // want it synchronous so the global mirror is observable immediately. The
    // hook closes over `window.requestAnimationFrame`, so stub that exact ref.
    // Return null (not a handle) so the hook's `viewSyncRafRef.current = rAF(...)`
    // assignment doesn't overwrite the null the synchronous callback just set —
    // otherwise the ref reads truthy and the NEXT sync is suppressed (a real
    // browser returns a handle but runs the callback async, so this race is a
    // test-only artifact of firing synchronously).
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      cb(0)

      return null as unknown as number
    })
    setTurnStartedAt(null)
    $connection.set(null)
    $activeGatewayProfile.set('default')
    $activeSessionId.set(null)
    setActiveSessionStoredIdRotation(null)
    setCurrentModel('')
    setCurrentModelSource('')
    setCurrentProvider('')
    setCurrentReasoningEffort('')
    setCurrentServiceTier('')
    setCurrentFastMode(false)
    $attentionSessionIds.set([])
    $workingSessionIds.set([])
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    setTurnStartedAt(null)
    $connection.set(null)
    $activeGatewayProfile.set('default')
    $activeSessionId.set(null)
    setActiveSessionStoredIdRotation(null)
    setCurrentModel('')
    setCurrentModelSource('')
    setCurrentProvider('')
    setCurrentReasoningEffort('')
    setCurrentServiceTier('')
    setCurrentFastMode(false)
    $attentionSessionIds.set([])
    $workingSessionIds.set([])
  })

  it("keeps a background session's running turn clock and never mirrors it to the view", () => {
    let cache!: Cache
    // Active session is "fg-runtime"; the turn starts on the BACKGROUND session.
    render(<Harness activeSessionId="fg-runtime" onReady={c => (cache = c)} selectedStoredSessionId="fg-stored" />)

    const startedAt = 1_700_000_000_000

    act(() => {
      cache.updateSessionState('bg-runtime', state => ({ ...state, busy: true, turnStartedAt: startedAt }), 'bg-stored')
    })

    // The background session's own cache entry holds the clock...
    expect(cache.sessionStateByRuntimeIdRef.current.get('bg-runtime')?.turnStartedAt).toBe(startedAt)
    // ...but the global atom (statusbar timer) is untouched — a background turn
    // must not drive the foreground timer.
    expect($turnStartedAt.get()).toBeNull()
  })

  it("mirrors the focused session's turn clock into the global atom on view-sync", () => {
    let cache!: Cache
    render(<Harness activeSessionId="fg-runtime" onReady={c => (cache = c)} selectedStoredSessionId="fg-stored" />)

    const startedAt = 1_700_000_111_000

    // A turn on the ACTIVE session stages into the view; the flush mirrors its
    // turnStartedAt into the global atom the statusbar reads.
    act(() => {
      cache.updateSessionState('fg-runtime', state => ({ ...state, busy: true, turnStartedAt: startedAt }), 'fg-stored')
    })

    expect($turnStartedAt.get()).toBe(startedAt)
  })

  it('clears the global clock when the focused turn ends', () => {
    let cache!: Cache
    render(<Harness activeSessionId="fg-runtime" onReady={c => (cache = c)} selectedStoredSessionId="fg-stored" />)

    act(() => {
      cache.updateSessionState(
        'fg-runtime',
        state => ({ ...state, busy: true, turnStartedAt: 1_700_000_222_000 }),
        'fg-stored'
      )
    })
    expect($turnStartedAt.get()).toBe(1_700_000_222_000)

    act(() => {
      cache.updateSessionState('fg-runtime', state => ({ ...state, busy: false, turnStartedAt: null }))
    })
    expect($turnStartedAt.get()).toBeNull()
  })

  it('projects a fresh turn under its runtime id until persistence assigns a stored id', () => {
    let cache!: Cache
    render(<Harness activeSessionId="fresh-runtime" onReady={c => (cache = c)} selectedStoredSessionId={null} />)

    act(() => {
      cache.updateSessionState('fresh-runtime', state => ({ ...state, busy: true, needsInput: true }))
    })

    expect($workingSessionIds.get()).toContain('fresh-runtime')
    expect($attentionSessionIds.get()).toContain('fresh-runtime')

    act(() => {
      cache.ensureSessionState('fresh-runtime', 'stored-one')
    })

    expect($workingSessionIds.get()).toEqual(['stored-one'])
    expect($attentionSessionIds.get()).toEqual(['stored-one'])
  })

  it("signals an active session's stored-id rotation after compression", () => {
    let cache!: Cache
    $activeSessionId.set('fg-runtime')
    render(<Harness activeSessionId="fg-runtime" onReady={c => (cache = c)} selectedStoredSessionId="stored-old" />)

    act(() => {
      cache.ensureSessionState('fg-runtime', 'stored-old')
      cache.ensureSessionState('fg-runtime', 'stored-new')
    })

    expect($activeSessionStoredIdRotation.get()).toEqual({
      nextStoredSessionId: 'stored-new',
      previousStoredSessionId: 'stored-old',
      runtimeSessionId: 'fg-runtime'
    })
    expect(cache.runtimeIdByStoredSessionIdRef.current.has('stored-old')).toBe(false)
    expect(cache.runtimeIdByStoredSessionIdRef.current.get('stored-new')).toBe('fg-runtime')
    expect(cache.resolveStoredSessionId('stored-old')).toBe('stored-new')
  })

  it('resolves repeated stored-id rotations transitively to the live tip', () => {
    let cache!: Cache
    render(<Harness activeSessionId="runtime-A" onReady={c => (cache = c)} selectedStoredSessionId="stored-A" />)

    act(() => {
      cache.ensureSessionState('runtime-A', 'stored-A')
      cache.ensureSessionState('runtime-A', 'stored-B')
      cache.ensureSessionState('runtime-A', 'stored-C')
    })

    expect(cache.resolveStoredSessionId('stored-A')).toBe('stored-C')
    expect(cache.resolveStoredSessionId('stored-B')).toBe('stored-C')
    expect(cache.resolveStoredSessionId('stored-C')).toBe('stored-C')
  })

  it('discards stored-id aliases when the active gateway profile changes', () => {
    let cache!: Cache
    $activeGatewayProfile.set('profile-a')
    render(<Harness activeSessionId="runtime-A" onReady={c => (cache = c)} selectedStoredSessionId="stored-A" />)

    act(() => {
      cache.ensureSessionState('runtime-A', 'stored-A')
      cache.ensureSessionState('runtime-A', 'stored-B')
    })
    expect(cache.resolveStoredSessionId('stored-A')).toBe('stored-B')

    act(() => $activeGatewayProfile.set('profile-b'))

    expect(cache.resolveStoredSessionId('stored-A')).toBe('stored-A')
    expect(cache.runtimeIdByStoredSessionIdRef.current.has('stored-B')).toBe(false)
  })

  it('discards stored-id aliases when the backend changes under the same profile', () => {
    let cache!: Cache
    $connection.set({ baseUrl: 'https://backend-a.example', mode: 'remote' } as never)
    render(<Harness activeSessionId="runtime-A" onReady={c => (cache = c)} selectedStoredSessionId="stored-A" />)

    act(() => {
      cache.ensureSessionState('runtime-A', 'stored-A')
      cache.ensureSessionState('runtime-A', 'stored-B')
    })
    expect(cache.resolveStoredSessionId('stored-A')).toBe('stored-B')

    act(() => $connection.set({ baseUrl: 'https://backend-b.example', mode: 'remote' } as never))

    expect(cache.resolveStoredSessionId('stored-A')).toBe('stored-A')
    expect(cache.runtimeIdByStoredSessionIdRef.current.size).toBe(0)
  })

  it('rejects a late stored-id rotation from a background profile', () => {
    let cache!: Cache
    $activeGatewayProfile.set('profile-a')
    render(<Harness activeSessionId="runtime-A" onReady={c => (cache = c)} selectedStoredSessionId="stored-A" />)

    act(() => {
      cache.ensureSessionState('runtime-A', 'stored-A', 'profile-a')
      cache.ensureSessionState('runtime-A', 'stored-B', 'profile-a')
      setActiveSessionStoredIdRotation(null)
      $activeGatewayProfile.set('profile-b')
      cache.ensureSessionState('runtime-A', 'stored-C', 'profile-a')
    })

    expect(cache.resolveStoredSessionId('stored-B')).toBe('stored-B')
    expect($activeSessionStoredIdRotation.get()).toBeNull()
  })

  it('does not run a late background-profile updater or contaminate the active profile cache', () => {
    let cache!: Cache
    $activeGatewayProfile.set('profile-a')
    render(<Harness activeSessionId="runtime-A" onReady={c => (cache = c)} selectedStoredSessionId="stored-A" />)

    act(() => {
      cache.updateSessionState('runtime-A', state => ({ ...state, model: 'profile-a-model' }), 'stored-A', 'profile-a')
      $activeGatewayProfile.set('profile-b')
    })

    const updater = vi.fn((state: NonNullable<ReturnType<typeof cache.sessionStateByRuntimeIdRef.current.get>>) => ({
      ...state,
      model: 'stale-profile-a-model'
    }))

    act(() => {
      cache.updateSessionState('runtime-A', updater, 'stored-A', 'profile-a')
    })

    expect(updater).not.toHaveBeenCalled()
    expect(cache.sessionStateByRuntimeIdRef.current.get('runtime-A')?.model).toBe('profile-a-model')
    expect(cache.runtimeIdByStoredSessionIdRef.current.has('stored-A')).toBe(false)
  })

  it('mirrors the focused session model metadata when switching from a cached session', () => {
    let cache!: Cache

    const { rerender } = render(
      <Harness activeSessionId="fg-runtime" onReady={c => (cache = c)} selectedStoredSessionId="fg-stored" />
    )

    act(() => {
      cache.updateSessionState(
        'bg-runtime',
        state => ({
          ...state,
          fast: true,
          model: 'anthropic/claude-opus-4.8',
          provider: 'anthropic',
          reasoningEffort: 'high',
          serviceTier: 'priority'
        }),
        'bg-stored'
      )
    })

    // Background metadata is cached but must not bleed into the visible statusbar.
    expect($currentModel.get()).toBe('')
    expect($currentReasoningEffort.get()).toBe('')
    expect($currentFastMode.get()).toBe(false)

    rerender(<Harness activeSessionId="bg-runtime" onReady={c => (cache = c)} selectedStoredSessionId="bg-stored" />)

    const bgState = cache.sessionStateByRuntimeIdRef.current.get('bg-runtime')
    expect(bgState).toBeTruthy()

    act(() => {
      cache.syncSessionStateToView('bg-runtime', bgState!)
    })

    expect($currentModel.get()).toBe('anthropic/claude-opus-4.8')
    expect($currentProvider.get()).toBe('anthropic')
    expect($currentReasoningEffort.get()).toBe('high')
    expect($currentServiceTier.get()).toBe('priority')
    expect($currentFastMode.get()).toBe(true)
  })

  it('preserves a manual composer choice while caching active-session heartbeat metadata', () => {
    setCurrentModel('manual-model')
    setCurrentProvider('manual-provider')
    setCurrentReasoningEffort('high')
    setCurrentServiceTier('standard')
    setCurrentFastMode(false)
    setCurrentModelSource('manual')

    let cache!: Cache
    render(<Harness activeSessionId="fg-runtime" onReady={c => (cache = c)} selectedStoredSessionId="fg-stored" />)

    act(() => {
      cache.updateSessionState(
        'fg-runtime',
        state => ({
          ...state,
          fast: true,
          model: 'profile-default',
          provider: 'profile-provider',
          reasoningEffort: 'low',
          serviceTier: 'priority'
        }),
        'fg-stored'
      )
    })

    expect(cache.sessionStateByRuntimeIdRef.current.get('fg-runtime')).toMatchObject({
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

  it('clears stale model metadata when the newly focused session has no cached value', () => {
    setCurrentModel('previous-model')
    setCurrentProvider('previous-provider')
    setCurrentReasoningEffort('high')
    setCurrentServiceTier('priority')
    setCurrentFastMode(true)

    let cache!: Cache

    const { rerender } = render(
      <Harness activeSessionId="fg-runtime" onReady={c => (cache = c)} selectedStoredSessionId="fg-stored" />
    )

    act(() => {
      cache.updateSessionState('bg-runtime', state => ({ ...state }), 'bg-stored')
    })

    rerender(<Harness activeSessionId="bg-runtime" onReady={c => (cache = c)} selectedStoredSessionId="bg-stored" />)

    const bgState = cache.sessionStateByRuntimeIdRef.current.get('bg-runtime')
    expect(bgState).toBeTruthy()

    act(() => {
      cache.syncSessionStateToView('bg-runtime', bgState!)
    })

    expect($currentModel.get()).toBe('')
    expect($currentProvider.get()).toBe('')
    expect($currentReasoningEffort.get()).toBe('')
    expect($currentServiceTier.get()).toBe('')
    expect($currentFastMode.get()).toBe(false)
  })
})

function userMessage(id: string, text: string): ChatMessage {
  return { id, role: 'user', parts: [{ type: 'text', text }] }
}

function assistantText(id: string, text: string): ChatMessage {
  return { id, role: 'assistant', parts: [{ type: 'text', text }] }
}

function assistantError(id: string, error: string): ChatMessage {
  return { id, role: 'assistant', parts: [], error, pending: false }
}

interface ViewHarnessProps {
  activeSessionId: string | null
  onReady: (cache: Cache) => void
}

function ViewHarness({ activeSessionId, onReady }: ViewHarnessProps) {
  const busyRef: MutableRefObject<boolean> = { current: false }

  const cache = useSessionStateCache({
    activeSessionId,
    busyRef,
    selectedStoredSessionId: null,
    setAwaitingResponse: () => undefined,
    setBusy: () => undefined,
    // Wire the published view back into the real $messages atom the flush
    // reads from, so the round-trip matches production.
    setMessages: messages => $messages.set(messages)
  })

  onReady(cache)

  return null
}

describe('useSessionStateCache — cross-thread error isolation', () => {
  afterEach(() => {
    cleanup()
    $messages.set([])
  })

  it('does not leak a failed turn into another thread on switch', () => {
    $messages.set([])
    let cache!: Cache
    const { rerender } = render(<ViewHarness activeSessionId="thread-A" onReady={c => (cache = c)} />)

    // Thread A ends its turn with an out-of-funds error and is on screen.
    act(() => {
      cache.updateSessionState(
        'thread-A',
        state => ({
          ...state,
          busy: false,
          messages: [userMessage('user-a', 'do the thing'), assistantError('assistant-a-error', 'Out of funds')]
        }),
        'stored-A'
      )
    })

    expect($messages.get().some(message => message.error === 'Out of funds')).toBe(true)

    // Switch to thread B (which completed cleanly). Its cached state syncs to
    // the view while $messages still holds thread A's transcript.
    rerender(<ViewHarness activeSessionId="thread-B" onReady={c => (cache = c)} />)
    act(() => {
      cache.updateSessionState(
        'thread-B',
        state => ({
          ...state,
          busy: false,
          messages: [userMessage('user-b', 'hello'), assistantText('assistant-b', 'hi there')]
        }),
        'stored-B'
      )
    })

    expect($messages.get().map(message => message.id)).toEqual(['user-b', 'assistant-b'])
    expect($messages.get().some(message => message.error === 'Out of funds')).toBe(false)
  })

  it('still preserves a same-session local error a heartbeat dropped', () => {
    $messages.set([])
    let cache!: Cache
    render(<ViewHarness activeSessionId="thread-A" onReady={c => (cache = c)} />)

    // First paint establishes thread A as the on-screen session.
    act(() => {
      cache.updateSessionState(
        'thread-A',
        state => ({ ...state, busy: false, messages: [userMessage('user-a', 'do the thing')] }),
        'stored-A'
      )
    })

    // A local error lands in the view (e.g. failAssistantMessage wrote it).
    $messages.set([userMessage('user-a', 'do the thing'), assistantError('assistant-a-error', 'OpenRouter 403')])

    // A later same-session heartbeat carries cached state that lost the error.
    act(() => {
      cache.updateSessionState('thread-A', state => ({
        ...state,
        busy: false,
        messages: [userMessage('user-a', 'do the thing')]
      }))
    })

    expect($messages.get().some(message => message.error === 'OpenRouter 403')).toBe(true)
  })

  it('keeps the current transcript reference when warm-resume content is equivalent', () => {
    $messages.set([])
    let cache!: Cache
    render(<ViewHarness activeSessionId="thread-A" onReady={value => (cache = value)} />)

    act(() => {
      cache.updateSessionState(
        'thread-A',
        state => ({
          ...state,
          busy: false,
          messages: [userMessage('user-a', 'hello'), assistantText('assistant-a', 'hi')]
        }),
        'stored-A'
      )
    })

    const firstPaint = $messages.get()

    act(() => {
      cache.updateSessionState('thread-A', state => ({
        ...state,
        busy: false,
        messages: [userMessage('user-a', 'hello'), assistantText('assistant-a', 'hi')]
      }))
    })

    expect($messages.get()).toBe(firstPaint)
  })
})
