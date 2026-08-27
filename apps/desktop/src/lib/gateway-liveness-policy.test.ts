import { describe, expect, it } from 'vitest'

import { decideLivenessForceClose, LIVENESS_PROBE_FAILURE_STREAK } from './gateway-liveness-policy'

describe('decideLivenessForceClose', () => {
  it('defers the first failed probe while work is in flight', () => {
    expect(decideLivenessForceClose({ workingSessionCount: 1, consecutiveFailures: 1 })).toEqual({
      close: false,
      reason: 'in-flight-work-deferred'
    })
  })

  it('closes when the busy failure streak is exhausted', () => {
    expect(
      decideLivenessForceClose({ workingSessionCount: 2, consecutiveFailures: LIVENESS_PROBE_FAILURE_STREAK })
    ).toEqual({ close: true, reason: 'failure-streak-exhausted' })
  })

  it('closes immediately when no work is in flight', () => {
    expect(decideLivenessForceClose({ workingSessionCount: 0, consecutiveFailures: 1 })).toEqual({
      close: true,
      reason: 'no-in-flight-work'
    })
  })
})
