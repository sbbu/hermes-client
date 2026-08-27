export const LIVENESS_PROBE_FAILURE_STREAK = 2
export const LIVENESS_REPROBE_DELAY_MS = 3_000

export type LivenessForceCloseReason = 'in-flight-work-deferred' | 'failure-streak-exhausted' | 'no-in-flight-work'

export interface LivenessForceCloseDecision {
  close: boolean
  reason: LivenessForceCloseReason
}

/** Avoid tearing down a busy remote turn after one inconclusive ping timeout. */
export function decideLivenessForceClose(input: {
  consecutiveFailures: number
  workingSessionCount: number
}): LivenessForceCloseDecision {
  const workingSessionCount = Math.max(0, Math.floor(input.workingSessionCount))
  const consecutiveFailures = Math.max(1, Math.floor(input.consecutiveFailures))

  if (workingSessionCount > 0 && consecutiveFailures < LIVENESS_PROBE_FAILURE_STREAK) {
    return { close: false, reason: 'in-flight-work-deferred' }
  }

  return workingSessionCount > 0
    ? { close: true, reason: 'failure-streak-exhausted' }
    : { close: true, reason: 'no-in-flight-work' }
}
