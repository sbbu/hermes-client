import { act, cleanup, render, waitFor } from '@testing-library/react'
import type { MutableRefObject } from 'react'
import { useEffect } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { getSessionMessages } from '@/hermes'
import { createClientSessionState } from '@/lib/chat-runtime'
import { $activeGatewayProfile, $newChatProfile, ensureGatewayProfile } from '@/store/profile'
import {
  $activeSessionStoredIdRotation,
  $currentCwd,
  $currentFastMode,
  $currentModel,
  $currentProvider,
  $currentReasoningEffort,
  $messages,
  $resumeFailedSessionId,
  $selectedStoredSessionId,
  getCurrentModelSource,
  markComposerSelectionManual,
  setActiveSessionStoredIdRotation,
  setCurrentModelSource,
  setMessages,
  setResumeFailedSessionId
} from '@/store/session'

import { sessionRoute } from '../../routes'
import type { ClientSessionState } from '../../types'

import { useSessionActions } from './use-session-actions'

vi.mock('@/hermes', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  deleteSession: vi.fn(),
  getSessionMessages: vi.fn(),
  listAllProfileSessions: vi.fn(),
  setApiRequestProfile: vi.fn(),
  setSessionArchived: vi.fn()
}))

vi.mock('@/store/profile', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ensureGatewayProfile: vi.fn(async () => undefined)
}))

const RUNTIME_SESSION_ID = 'rt-new-001'

function Harness({
  onReady,
  requestGateway
}: {
  onReady: (create: (preview?: string | null) => Promise<string | null>) => void
  requestGateway: <T>(method: string, params?: Record<string, unknown>) => Promise<T>
}) {
  const ref = <T,>(value: T): MutableRefObject<T> => ({ current: value })

  const actions = useSessionActions({
    activeSessionId: null,
    activeSessionIdRef: ref<string | null>(null),
    busyRef: ref(false),
    creatingSessionRef: ref(false),
    ensureSessionState: () => ({}) as ClientSessionState,
    getRouteToken: () => 'token',
    navigate: vi.fn() as never,
    requestGateway,
    resetViewSync: vi.fn(),
    runtimeIdByStoredSessionIdRef: ref(new Map<string, string>()),
    selectedStoredSessionId: null,
    selectedStoredSessionIdRef: ref<string | null>(null),
    sessionStateByRuntimeIdRef: ref(new Map<string, ClientSessionState>()),
    syncSessionStateToView: vi.fn(),
    updateSessionState: () => ({}) as ClientSessionState
  })

  useEffect(() => {
    onReady(actions.createBackendSessionForSend)
  }, [actions.createBackendSessionForSend, onReady])

  return null
}

async function createWith(profileSetup: () => void): Promise<Record<string, unknown> | undefined> {
  let createParams: Record<string, unknown> | undefined

  const requestGateway = vi.fn(async (method: string, params?: Record<string, unknown>) => {
    if (method === 'session.create') {
      createParams = params

      return { session_id: RUNTIME_SESSION_ID, stored_session_id: null } as never
    }

    return {} as never
  })

  $currentCwd.set('')
  profileSetup()

  let create: ((preview?: string | null) => Promise<string | null>) | null = null
  render(<Harness onReady={c => (create = c)} requestGateway={requestGateway} />)
  await waitFor(() => expect(create).not.toBeNull())
  await create!()

  return createParams
}

describe('createBackendSessionForSend profile routing', () => {
  afterEach(() => {
    cleanup()
    $newChatProfile.set(null)
    $activeGatewayProfile.set('default')
    $currentModel.set('')
    $currentProvider.set('')
    $currentReasoningEffort.set('')
    $currentFastMode.set(false)
    vi.restoreAllMocks()
    vi.mocked(ensureGatewayProfile).mockResolvedValue(undefined)
  })

  it('routes a plain new chat (no explicit profile) to the live gateway profile', async () => {
    // The "rubberband to default" bug: the top New Session button clears
    // $newChatProfile to null. In global-remote mode one backend serves every
    // profile, so an omitted `profile` lands the chat on the launch (default)
    // profile. The session must instead carry the active gateway profile.
    const params = await createWith(() => {
      $activeGatewayProfile.set('coder')
      $newChatProfile.set(null)
    })

    expect(params).toMatchObject({ profile: 'coder' })
  })

  it('honours an explicit per-profile "+" selection', async () => {
    const params = await createWith(() => {
      $activeGatewayProfile.set('coder')
      $newChatProfile.set('analyst')
    })

    expect(params).toMatchObject({ profile: 'analyst' })
  })

  it('passes the default profile for single-profile users (backend resolves it to launch)', async () => {
    const params = await createWith(() => {
      $activeGatewayProfile.set('default')
      $newChatProfile.set(null)
    })

    expect(params).toMatchObject({ profile: 'default' })
  })

  it('tags new desktop chats as desktop sessions', async () => {
    const params = await createWith(() => {})

    expect(params).toMatchObject({ source: 'desktop' })
  })

  it('snapshots selector choices before waiting for the target profile', async () => {
    let releaseProfile!: () => void
    vi.mocked(ensureGatewayProfile).mockImplementationOnce(
      () => new Promise<void>(resolve => (releaseProfile = resolve))
    )
    $activeGatewayProfile.set('coder')
    $newChatProfile.set(null)
    $currentModel.set('chosen/model')
    $currentProvider.set('chosen-provider')
    $currentReasoningEffort.set('high')
    $currentFastMode.set(false)

    let createParams: Record<string, unknown> | undefined

    const requestGateway = vi.fn(async (method: string, params?: Record<string, unknown>) => {
      if (method === 'session.create') {
        createParams = params

        return { session_id: RUNTIME_SESSION_ID, stored_session_id: null } as never
      }

      return {} as never
    })

    let create: ((preview?: string | null) => Promise<string | null>) | null = null
    render(<Harness onReady={c => (create = c)} requestGateway={requestGateway} />)
    await waitFor(() => expect(create).not.toBeNull())

    const pending = create!()
    await waitFor(() => expect(ensureGatewayProfile).toHaveBeenCalledWith('coder'))
    $currentModel.set('refreshed/model')
    $currentProvider.set('refreshed-provider')
    $currentReasoningEffort.set('low')
    $currentFastMode.set(true)
    releaseProfile()
    await pending

    expect(createParams).toMatchObject({
      fast: false,
      model: 'chosen/model',
      profile: 'coder',
      provider: 'chosen-provider',
      reasoning_effort: 'high'
    })
  })
})

function StoredIdRotationHarness({
  navigate,
  routedStoredSessionId,
  selectedRef
}: {
  navigate: ReturnType<typeof vi.fn>
  routedStoredSessionId: string | null
  selectedRef: MutableRefObject<string | null>
}) {
  useSessionActions({
    activeSessionId: 'runtime-1',
    activeSessionIdRef: { current: 'runtime-1' },
    busyRef: { current: false },
    creatingSessionRef: { current: false },
    ensureSessionState: () => ({}) as ClientSessionState,
    getRoutedStoredSessionId: () => routedStoredSessionId,
    getRouteToken: () => 'token',
    navigate: navigate as never,
    requestGateway: vi.fn(),
    resetViewSync: vi.fn(),
    resolveStoredSessionId: storedSessionId => (storedSessionId === 'stored-old' ? 'stored-new' : storedSessionId),
    runtimeIdByStoredSessionIdRef: { current: new Map([['stored-new', 'runtime-1']]) },
    selectedStoredSessionId: selectedRef.current,
    selectedStoredSessionIdRef: selectedRef,
    sessionStateByRuntimeIdRef: { current: new Map() },
    syncSessionStateToView: vi.fn(),
    updateSessionState: () => ({}) as ClientSessionState
  })

  return null
}

describe('stored-session rotation', () => {
  afterEach(() => {
    cleanup()
    setActiveSessionStoredIdRotation(null)
    $selectedStoredSessionId.set(null)
  })

  it('re-anchors the route after compression rotates the stored id', async () => {
    const navigate = vi.fn()
    const selectedRef = { current: 'stored-old' }

    render(<StoredIdRotationHarness navigate={navigate} routedStoredSessionId="stored-old" selectedRef={selectedRef} />)

    act(() =>
      setActiveSessionStoredIdRotation({
        nextStoredSessionId: 'stored-new',
        previousStoredSessionId: 'stored-old',
        runtimeSessionId: 'runtime-1'
      })
    )

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith(sessionRoute('stored-new'), { replace: true })
    })
    expect($activeSessionStoredIdRotation.get()).toBeNull()
    expect($selectedStoredSessionId.get()).toBe('stored-new')
    expect(selectedRef.current).toBe('stored-new')
  })

  it('updates selection without leaving a non-chat route', async () => {
    const navigate = vi.fn()
    const selectedRef = { current: 'stored-old' }

    render(<StoredIdRotationHarness navigate={navigate} routedStoredSessionId={null} selectedRef={selectedRef} />)

    act(() =>
      setActiveSessionStoredIdRotation({
        nextStoredSessionId: 'stored-new',
        previousStoredSessionId: 'stored-old',
        runtimeSessionId: 'runtime-1'
      })
    )

    await waitFor(() => expect($activeSessionStoredIdRotation.get()).toBeNull())
    expect(selectedRef.current).toBe('stored-new')
    expect(navigate).not.toHaveBeenCalled()
  })
})

function WarmResumeHarness({
  onReady,
  syncSessionStateToView
}: {
  onReady: (resume: (storedSessionId: string, replaceRoute?: boolean) => Promise<unknown>) => void
  syncSessionStateToView: (sessionId: string, state: ClientSessionState) => void
}) {
  const cachedState = {
    ...createClientSessionState(),
    model: 'session-b-model',
    provider: 'session-b-provider',
    storedSessionId: 'stored-b'
  }

  const selectedRef = { current: 'stored-a' as string | null }

  const actions = useSessionActions({
    activeSessionId: 'runtime-a',
    activeSessionIdRef: { current: 'runtime-a' },
    busyRef: { current: false },
    creatingSessionRef: { current: false },
    ensureSessionState: () => cachedState,
    getRouteToken: () => 'token',
    navigate: vi.fn() as never,
    requestGateway: vi.fn(async () => ({}) as never),
    resetViewSync: vi.fn(),
    runtimeIdByStoredSessionIdRef: { current: new Map([['stored-b', 'runtime-b']]) },
    selectedStoredSessionId: selectedRef.current,
    selectedStoredSessionIdRef: selectedRef,
    sessionStateByRuntimeIdRef: { current: new Map([['runtime-b', cachedState]]) },
    syncSessionStateToView,
    updateSessionState: () => cachedState
  })

  useEffect(() => {
    onReady(actions.resumeSession)
  }, [actions.resumeSession, onReady])

  return null
}

describe('resumeSession composer model intent', () => {
  afterEach(() => {
    cleanup()
    setCurrentModelSource('')
    vi.restoreAllMocks()
    vi.mocked(ensureGatewayProfile).mockResolvedValue(undefined)
  })

  it('releases a manual model guard when intentionally switching warm sessions', async () => {
    setCurrentModelSource('manual')
    const syncSessionStateToView = vi.fn()
    let resume: ((storedSessionId: string, replaceRoute?: boolean) => Promise<unknown>) | null = null

    render(<WarmResumeHarness onReady={next => (resume = next)} syncSessionStateToView={syncSessionStateToView} />)
    await waitFor(() => expect(resume).not.toBeNull())
    await resume!('stored-b')

    expect(getCurrentModelSource()).toBe('')
    expect(syncSessionStateToView).toHaveBeenCalledWith(
      'runtime-b',
      expect.objectContaining({ model: 'session-b-model', provider: 'session-b-provider' })
    )
  })

  it('does not clear a newer picker action when the session switch finishes', async () => {
    let releaseProfile!: () => void
    vi.mocked(ensureGatewayProfile).mockImplementationOnce(
      () => new Promise<void>(resolve => (releaseProfile = resolve))
    )
    setCurrentModelSource('manual')
    const syncSessionStateToView = vi.fn()
    let resume: ((storedSessionId: string, replaceRoute?: boolean) => Promise<unknown>) | null = null

    render(<WarmResumeHarness onReady={next => (resume = next)} syncSessionStateToView={syncSessionStateToView} />)
    await waitFor(() => expect(resume).not.toBeNull())
    const pending = resume!('stored-b')
    await waitFor(() => expect(ensureGatewayProfile).toHaveBeenCalled())
    expect(getCurrentModelSource()).toBe('')

    setCurrentModelSource('manual')
    releaseProfile()
    await pending

    expect(getCurrentModelSource()).toBe('manual')
  })
})

// ── Resume failure recovery (the "stuck loading session window" bug) ──────────
// When session.resume rejects AND the REST transcript fallback ALSO fails, the
// hook must (a) not throw out of the fallback (which stranded the loader), and
// (b) arm $resumeFailedSessionId so use-route-resume can retry. A resume that
// succeeds must NOT leave the flag armed.
function ResumeHarness({
  onReady,
  requestGateway
}: {
  onReady: (resume: (storedSessionId: string, replaceRoute?: boolean) => Promise<unknown>) => void
  requestGateway: <T>(method: string, params?: Record<string, unknown>) => Promise<T>
}) {
  const ref = <T,>(value: T): MutableRefObject<T> => ({ current: value })

  const actions = useSessionActions({
    activeSessionId: null,
    activeSessionIdRef: ref<string | null>(null),
    busyRef: ref(false),
    creatingSessionRef: ref(false),
    ensureSessionState: () => ({}) as ClientSessionState,
    getRouteToken: () => 'token',
    navigate: vi.fn() as never,
    requestGateway,
    resetViewSync: vi.fn(),
    runtimeIdByStoredSessionIdRef: ref(new Map<string, string>()),
    selectedStoredSessionId: null,
    selectedStoredSessionIdRef: ref<string | null>(null),
    sessionStateByRuntimeIdRef: ref(new Map<string, ClientSessionState>()),
    syncSessionStateToView: vi.fn(),
    updateSessionState: (_sessionId, updater) => updater({} as ClientSessionState)
  })

  useEffect(() => {
    onReady(actions.resumeSession)
  }, [actions.resumeSession, onReady])

  return null
}

describe('resumeSession failure recovery', () => {
  afterEach(() => {
    cleanup()
    setResumeFailedSessionId(null)
    setMessages([])
    setCurrentModelSource('')
    $currentModel.set('')
    $currentProvider.set('')
    $currentReasoningEffort.set('')
    $currentFastMode.set(false)
    vi.restoreAllMocks()
    vi.mocked(ensureGatewayProfile).mockResolvedValue(undefined)
  })

  async function runResume(
    requestGateway: <T>(method: string, params?: Record<string, unknown>) => Promise<T>
  ): Promise<void> {
    let resume: ((storedSessionId: string, replaceRoute?: boolean) => Promise<unknown>) | null = null
    render(<ResumeHarness onReady={r => (resume = r)} requestGateway={requestGateway} />)
    await waitFor(() => expect(resume).not.toBeNull())
    await resume!('stored-1', true)
  }

  it('preserves a newer picker action through a cold resume response', async () => {
    let releaseProfile!: () => void
    vi.mocked(ensureGatewayProfile).mockImplementationOnce(
      () => new Promise<void>(resolve => (releaseProfile = resolve))
    )
    vi.mocked(getSessionMessages).mockResolvedValue({ messages: [] } as never)
    setCurrentModelSource('manual')

    const requestGateway = vi.fn(async (method: string) => {
      if (method === 'session.resume') {
        return {
          info: {
            fast: true,
            model: 'stored-model',
            provider: 'stored-provider',
            reasoning_effort: 'low'
          },
          messages: [],
          running: false,
          session_id: 'runtime-b'
        } as never
      }

      return {} as never
    })

    const pending = runResume(requestGateway)
    await waitFor(() => expect(ensureGatewayProfile).toHaveBeenCalled())
    expect(getCurrentModelSource()).toBe('')

    $currentModel.set('new-picker-model')
    $currentProvider.set('new-picker-provider')
    $currentReasoningEffort.set('high')
    $currentFastMode.set(false)
    markComposerSelectionManual()
    releaseProfile()
    await pending

    expect(getCurrentModelSource()).toBe('manual')
    expect($currentModel.get()).toBe('new-picker-model')
    expect($currentProvider.get()).toBe('new-picker-provider')
    expect($currentReasoningEffort.get()).toBe('high')
    expect($currentFastMode.get()).toBe(false)
  })

  it('arms $resumeFailedSessionId when resume RPC and REST fallback both fail', async () => {
    // session.resume rejects (e.g. timeout against a wedged backend)...
    const requestGateway = vi.fn(async (method: string) => {
      if (method === 'session.resume') {
        throw new Error('request timed out: session.resume')
      }

      return {} as never
    })

    // ...and the REST transcript fallback also rejects (backend unreachable).
    vi.mocked(getSessionMessages).mockRejectedValue(new Error('network down'))

    await runResume(requestGateway)

    // The window is no longer silently stranded: the failure latch is armed for
    // the stored session, which use-route-resume consumes to retry.
    expect($resumeFailedSessionId.get()).toBe('stored-1')
  })

  it('does NOT arm the failure latch when the resume RPC fails but the REST fallback paints history', async () => {
    // session.resume rejects, but the REST transcript fallback succeeds and
    // hydrates a readable transcript — the window is NOT stranded.
    const requestGateway = vi.fn(async (method: string) => {
      if (method === 'session.resume') {
        throw new Error('request timed out: session.resume')
      }

      return {} as never
    })

    vi.mocked(getSessionMessages).mockResolvedValue({
      messages: [
        { content: 'hello', role: 'user', timestamp: 1 },
        { content: 'hi there', role: 'assistant', timestamp: 2 }
      ],
      session_id: 'stored-1'
    } as never)

    await runResume(requestGateway)

    // Arming here would auto-retry a window that already shows history and,
    // on exhaustion, blank that transcript behind the error overlay — a
    // regression vs. plain fallback-success. The latch must stay clear.
    expect($resumeFailedSessionId.get()).toBeNull()
    // The fallback transcript is visible.
    expect($messages.get().length).toBeGreaterThan(0)
  })

  it('does NOT throw out of the fallback when REST also fails (no unhandled rejection)', async () => {
    const requestGateway = vi.fn(async (method: string) => {
      if (method === 'session.resume') {
        throw new Error('request timed out: session.resume')
      }

      return {} as never
    })

    vi.mocked(getSessionMessages).mockRejectedValue(new Error('network down'))

    // resumeSession must resolve (swallow the fallback failure), not reject.
    await expect(runResume(requestGateway)).resolves.toBeUndefined()
  })

  it('leaves the failure latch clear when resume succeeds', async () => {
    // Pre-arm to prove a successful resume clears it (entry-clear path).
    setResumeFailedSessionId('stored-1')
    let resumeParams: Record<string, unknown> | undefined

    const requestGateway = vi.fn(async (method: string, params?: Record<string, unknown>) => {
      if (method === 'session.resume') {
        resumeParams = params

        return { session_id: 'runtime-1', resumed: params?.session_id, messages: [], info: {} } as never
      }

      return {} as never
    })

    vi.mocked(getSessionMessages).mockResolvedValue({ messages: [] } as never)

    await runResume(requestGateway)

    expect($resumeFailedSessionId.get()).toBeNull()
    expect(resumeParams).toMatchObject({ source: 'desktop' })
  })
})
