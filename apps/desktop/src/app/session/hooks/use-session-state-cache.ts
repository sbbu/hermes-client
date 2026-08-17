import { useStore } from '@nanostores/react'
import { type MutableRefObject, useCallback, useEffect, useLayoutEffect, useRef } from 'react'

import type { ChatMessage } from '@/lib/chat-messages'
import { preserveLocalAssistantErrors } from '@/lib/chat-messages'
import { createClientSessionState } from '@/lib/chat-runtime'
import { setMutableRef } from '@/lib/mutable-ref'
import { $activeGatewayProfile, normalizeProfileKey } from '@/store/profile'
import {
  $activeSessionId,
  $busy,
  $messages,
  getCurrentModelSource,
  noteSessionActivity,
  setActiveSessionStoredIdRotation,
  setCurrentFastMode,
  setCurrentModel,
  setCurrentPersonality,
  setCurrentProvider,
  setCurrentReasoningEffort,
  setCurrentServiceTier,
  setSessionAttention,
  setSessionWorking,
  setTurnStartedAt,
  setYoloActive
} from '@/store/session'

import type { ClientSessionState } from '../../types'

import { chatMessageArraysEquivalent } from './session-message-equivalence'

interface SessionStateCacheOptions {
  activeSessionId: string | null
  busyRef: MutableRefObject<boolean>
  selectedStoredSessionId: string | null
  setAwaitingResponse: (awaiting: boolean) => void
  setBusy: (busy: boolean) => void
  setMessages: (messages: ChatMessage[]) => void
}

function syncRuntimeMetadataToView(state: ClientSessionState) {
  // A manual picker choice is composer intent, not runtime telemetry. Keep
  // caching heartbeat metadata per session, but do not republish it over the
  // user's explicit next-turn selection.
  if (getCurrentModelSource() !== 'manual') {
    setCurrentModel(state.model ?? '')
    setCurrentProvider(state.provider ?? '')
    setCurrentReasoningEffort(state.reasoningEffort ?? '')
    setCurrentServiceTier(state.serviceTier ?? '')
    setCurrentFastMode(state.fast ?? false)
  }

  setYoloActive(state.yolo ?? false)
  setCurrentPersonality(state.personality ?? '')
}

export function useSessionStateCache({
  activeSessionId,
  busyRef,
  selectedStoredSessionId,
  setAwaitingResponse,
  setBusy,
  setMessages
}: SessionStateCacheOptions) {
  const busy = useStore($busy)
  const activeGatewayProfile = useStore($activeGatewayProfile)
  const activeSessionIdRef = useRef<string | null>(activeSessionId)
  const activeSessionIdPropRef = useRef(activeSessionId)
  const selectedStoredSessionIdRef = useRef<string | null>(selectedStoredSessionId)
  const selectedStoredSessionIdPropRef = useRef(selectedStoredSessionId)
  const sessionStateByRuntimeIdRef = useRef(new Map<string, ClientSessionState>())
  const runtimeIdByStoredSessionIdRef = useRef(new Map<string, string>())
  const storedSessionIdRedirectsRef = useRef(new Map<string, string>())
  const redirectsProfileRef = useRef(normalizeProfileKey(activeGatewayProfile))
  const pendingViewStateRef = useRef<{ sessionId: string; state: ClientSessionState } | null>(null)
  const viewSyncRafRef = useRef<number | null>(null)
  // Runtime id whose transcript currently occupies `$messages` — lets the
  // flush below tell a same-session refresh from a thread switch.
  const viewSessionIdRef = useRef<string | null>(null)

  // Keep event-facing refs coherent before child layout callbacks run, but only
  // after React commits the switch. Render-time writes leak ids from suspended
  // or discarded trees because ref objects are shared between fiber versions.
  // Guard on the source props so unrelated commits preserve imperative pins.
  useLayoutEffect(() => {
    if (activeSessionIdPropRef.current !== activeSessionId) {
      activeSessionIdPropRef.current = activeSessionId
      activeSessionIdRef.current = activeSessionId
    }

    if (selectedStoredSessionIdPropRef.current !== selectedStoredSessionId) {
      selectedStoredSessionIdPropRef.current = selectedStoredSessionId
      selectedStoredSessionIdRef.current = selectedStoredSessionId
    }
  }, [activeSessionId, selectedStoredSessionId])

  useEffect(() => {
    setMutableRef(busyRef, busy)
  }, [busy, busyRef])

  const syncRedirectProfile = useCallback(() => {
    const currentProfile = normalizeProfileKey($activeGatewayProfile.get())

    if (redirectsProfileRef.current !== currentProfile) {
      storedSessionIdRedirectsRef.current.clear()
      // Stored ids are profile-local. Keeping this profile-blind reverse map
      // across a gateway-profile switch can route the new profile into the
      // previous profile's runtime when both use the same stored id.
      runtimeIdByStoredSessionIdRef.current.clear()
      redirectsProfileRef.current = currentProfile
    }
  }, [])

  useEffect(syncRedirectProfile, [activeGatewayProfile, syncRedirectProfile])

  const resolveStoredSessionId = useCallback(
    (storedSessionId: string): string => {
      // Effects run after render. Fence profile identity synchronously so an old
      // profile's aliases cannot redirect a route during the switch commit.
      syncRedirectProfile()
      const visited: string[] = []
      const seen = new Set<string>()
      let current = storedSessionId

      while (true) {
        if (seen.has(current)) {
          return storedSessionId
        }

        seen.add(current)
        visited.push(current)
        const next = storedSessionIdRedirectsRef.current.get(current)

        if (!next || next === current) {
          break
        }

        current = next
      }

      for (const alias of visited) {
        if (alias !== current) {
          storedSessionIdRedirectsRef.current.set(alias, current)
        }
      }

      return current
    },
    [syncRedirectProfile]
  )

  const ensureSessionState = useCallback(
    (sessionId: string, storedSessionId?: string | null, sourceProfile?: string | null) => {
      syncRedirectProfile()

      if (sourceProfile && normalizeProfileKey(sourceProfile) !== redirectsProfileRef.current) {
        // A queued event from the profile we just left must not mutate this
        // profile-blind cache or either profile-blind route map.
        return sessionStateByRuntimeIdRef.current.get(sessionId) ?? createClientSessionState(storedSessionId ?? null)
      }

      const existing = sessionStateByRuntimeIdRef.current.get(sessionId)

      if (existing) {
        if (storedSessionId !== undefined && storedSessionId !== existing.storedSessionId) {
          const previousStoredSessionId = existing.storedSessionId
          existing.storedSessionId = storedSessionId

          const previousStatusId = previousStoredSessionId ?? sessionId
          const nextStatusId = storedSessionId ?? sessionId

          if (storedSessionId) {
            runtimeIdByStoredSessionIdRef.current.set(storedSessionId, sessionId)
          }

          if (existing.busy) {
            setSessionWorking(nextStatusId, true)
          }

          if (existing.needsInput) {
            setSessionAttention(nextStatusId, true)
          }

          if (previousStatusId !== nextStatusId) {
            setSessionWorking(previousStatusId, false)
            setSessionAttention(previousStatusId, false)
          }

          if (previousStoredSessionId) {
            runtimeIdByStoredSessionIdRef.current.delete(previousStoredSessionId)

            if (storedSessionId) {
              syncRedirectProfile()

              const rotationBelongsToActiveProfile =
                !sourceProfile || normalizeProfileKey(sourceProfile) === redirectsProfileRef.current

              if (rotationBelongsToActiveProfile) {
                storedSessionIdRedirectsRef.current.set(
                  previousStoredSessionId,
                  resolveStoredSessionId(storedSessionId)
                )
              }

              if (rotationBelongsToActiveProfile && sessionId === $activeSessionId.get()) {
                setActiveSessionStoredIdRotation({
                  nextStoredSessionId: storedSessionId,
                  previousStoredSessionId,
                  runtimeSessionId: sessionId
                })
              }
            }
          }
        }

        return existing
      }

      const created = createClientSessionState(storedSessionId ?? null)
      sessionStateByRuntimeIdRef.current.set(sessionId, created)

      if (storedSessionId) {
        runtimeIdByStoredSessionIdRef.current.set(storedSessionId, sessionId)
      }

      return created
    },
    [resolveStoredSessionId, syncRedirectProfile]
  )

  const resetViewSync = useCallback(() => {
    // Drop any RAF-pending transcript stage so a backgrounded turn cannot
    // repaint over the chat the user just switched to.
    pendingViewStateRef.current = null
    viewSessionIdRef.current = null

    if (viewSyncRafRef.current !== null && typeof window !== 'undefined') {
      window.cancelAnimationFrame(viewSyncRafRef.current)
      viewSyncRafRef.current = null
    }
  }, [])

  const flushPendingViewState = useCallback(() => {
    const pending = pendingViewStateRef.current
    pendingViewStateRef.current = null

    if (!pending || pending.sessionId !== activeSessionIdRef.current) {
      return
    }

    // `preserveLocalAssistantErrors` always returns a fresh array, so publishing
    // it unconditionally puts a new `$messages` reference on the store every
    // flush — including the periodic `session.info` heartbeats that don't touch
    // the transcript. That churns ChatView → runtimeMessageRepository → the
    // assistant-ui runtime → the virtualizer, which re-measures and visibly
    // jerks the scroll position while the user is reading. Skip the publish when
    // the merged result is content-equivalent to what's already on screen.
    // Warm resume reconciliation creates fresh message objects even when their
    // content is unchanged, so reference equality would cause a redundant
    // second paint and visible transcript jitter.
    const currentMessages = $messages.get()

    // On a thread switch `$messages` still holds the *previous* thread, so
    // preserving its local errors would graft that thread's failed turn (e.g.
    // an out-of-funds error) onto this one — then cascade it everywhere as the
    // polluted view becomes the next switch's baseline. Only carry errors
    // across a same-session refresh; our cached state already keeps its own.
    const nextMessages =
      viewSessionIdRef.current === pending.sessionId
        ? preserveLocalAssistantErrors(pending.state.messages, currentMessages)
        : pending.state.messages

    if (!chatMessageArraysEquivalent(nextMessages, currentMessages)) {
      setMessages(nextMessages)
    }

    viewSessionIdRef.current = pending.sessionId

    syncRuntimeMetadataToView(pending.state)
    setBusy(pending.state.busy)
    setMutableRef(busyRef, pending.state.busy)
    setAwaitingResponse(pending.state.awaitingResponse)
    // Mirror the focused session's per-session turn clock into the global
    // atom the statusbar timer reads. Keeps a backgrounded turn's elapsed
    // time intact on focus instead of zeroing it (the "timer restarts" bug).
    setTurnStartedAt(pending.state.turnStartedAt)
  }, [busyRef, setAwaitingResponse, setBusy, setMessages])

  const syncSessionStateToView = useCallback(
    (sessionId: string, state: ClientSessionState) => {
      // Only the currently-viewed session may stage into the shared `$messages`
      // view. A background session (e.g. one still busy and emitting stream /
      // error updates after the user toggled away) must update its own cache
      // entry but never the view — otherwise its messages clobber the
      // foreground transcript and appear to "bleed" into every other session.
      // The flush below also re-checks the active id, but staging here is what
      // prevents a background write from overwriting an already-pending
      // foreground write within the same animation frame (only one RAF is
      // scheduled, so the last `pendingViewStateRef` writer would otherwise win).
      if (sessionId !== activeSessionIdRef.current) {
        return
      }

      syncRuntimeMetadataToView(state)
      pendingViewStateRef.current = { sessionId, state }

      // Terminal / attention transitions (turn finished, error, or the agent is
      // now waiting on the user) MUST reach the view immediately. Electron
      // throttles `requestAnimationFrame` to ~0 while the window is
      // backgrounded, occluded, or unfocused, so an RAF-deferred flush can be
      // stranded in `pendingViewStateRef` indefinitely — that's the "new chat
      // stuck on Thinking until I refocus / F5" bug. Flush these synchronously
      // (cancelling any in-flight RAF, since we're about to publish the latest
      // state anyway). The plain busy heartbeat stays RAF-batched: that
      // coalescing exists only to keep periodic `session.info` updates from
      // churning `$messages` and jerking the scroll position while reading.
      const isCriticalTransition = !state.busy || state.needsInput

      if (isCriticalTransition) {
        if (viewSyncRafRef.current !== null && typeof window !== 'undefined') {
          window.cancelAnimationFrame(viewSyncRafRef.current)
          viewSyncRafRef.current = null
        }

        flushPendingViewState()

        return
      }

      if (viewSyncRafRef.current !== null) {
        return
      }

      if (typeof window === 'undefined') {
        flushPendingViewState()

        return
      }

      viewSyncRafRef.current = window.requestAnimationFrame(() => {
        viewSyncRafRef.current = null
        flushPendingViewState()
      })
    },
    [flushPendingViewState]
  )

  useEffect(
    () => () => {
      if (viewSyncRafRef.current !== null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(viewSyncRafRef.current)
        viewSyncRafRef.current = null
      }
    },
    []
  )

  const updateSessionState = useCallback(
    (
      sessionId: string,
      updater: (state: ClientSessionState) => ClientSessionState,
      storedSessionId?: string | null,
      sourceProfile?: string | null
    ) => {
      syncRedirectProfile()

      if (sourceProfile && normalizeProfileKey(sourceProfile) !== redirectsProfileRef.current) {
        // Do not invoke the updater: callers can perform edge-triggered side
        // effects from inside it in addition to mutating the cache below.
        return sessionStateByRuntimeIdRef.current.get(sessionId) ?? createClientSessionState(storedSessionId ?? null)
      }

      const previous = ensureSessionState(sessionId, storedSessionId, sourceProfile)
      const next = updater({ ...previous, messages: previous.messages })
      sessionStateByRuntimeIdRef.current.set(sessionId, next)

      // A fresh conversation has no persisted id yet. Its runtime id is the id
      // every renderer surface uses until the backend returns a stored id, so
      // keep the running/attention projections alive under that fallback and
      // migrate them when persistence assigns the durable id.
      const previousStatusId = previous.storedSessionId ?? sessionId
      const nextStatusId = next.storedSessionId ?? sessionId

      if (previousStatusId !== nextStatusId || !next.busy) {
        setSessionWorking(previousStatusId, false)
      }

      if (previousStatusId !== nextStatusId || !next.needsInput) {
        setSessionAttention(previousStatusId, false)
      }

      setSessionWorking(nextStatusId, next.busy)
      setSessionAttention(nextStatusId, next.needsInput)

      // Every state update is effectively a "still alive" heartbeat for
      // streaming events. The session-store watchdog uses this to keep the
      // working flag alive during long-running turns and to clear it once
      // the stream goes silent.
      if (next.busy) {
        noteSessionActivity(nextStatusId)
      }

      syncSessionStateToView(sessionId, next)

      return next
    },
    [ensureSessionState, syncRedirectProfile, syncSessionStateToView]
  )

  return {
    activeSessionIdRef,
    ensureSessionState,
    resetViewSync,
    resolveStoredSessionId,
    runtimeIdByStoredSessionIdRef,
    selectedStoredSessionIdRef,
    sessionStateByRuntimeIdRef,
    syncSessionStateToView,
    updateSessionState
  }
}
