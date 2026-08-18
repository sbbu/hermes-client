import { beforeEach, describe, expect, it, vi } from 'vitest'

const { activeProfile, profileRequest } = vi.hoisted(() => ({
  activeProfile: vi.fn(() => 'default'),
  profileRequest: vi.fn()
}))

vi.mock('@/store/gateway', () => ({
  activeGatewayProfileKey: activeProfile,
  requestGatewayForProfile: profileRequest
}))

const { requestForSessionProfile, sessionRpcNeedsProfileRoute } = await import('./session-request-router')

describe('session request routing', () => {
  beforeEach(() => {
    activeProfile.mockReturnValue('default')
    profileRequest.mockReset()
  })

  it('keeps ambient routing when the active profile owns the session', async () => {
    const ambient = vi.fn().mockResolvedValue('ambient')

    await expect(requestForSessionProfile('default', ambient, 'session.resume', { session_id: 's1' })).resolves.toBe(
      'ambient'
    )
    expect(profileRequest).not.toHaveBeenCalled()
  })

  it('pins a diverged session request to its owning profile', async () => {
    const ambient = vi.fn()
    profileRequest.mockResolvedValue('owned')

    await expect(requestForSessionProfile('worker', ambient, 'session.usage', { session_id: 'r1' })).resolves.toBe(
      'owned'
    )
    expect(ambient).not.toHaveBeenCalled()
    expect(profileRequest).toHaveBeenCalledWith('worker', 'session.usage', { session_id: 'r1' })
  })

  it('does not guess when session ownership is unknown', () => {
    expect(sessionRpcNeedsProfileRoute(null, 'worker')).toBe(false)
    expect(sessionRpcNeedsProfileRoute('', 'worker')).toBe(false)
  })
})
