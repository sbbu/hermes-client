import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/hermes', () => ({
  HermesGateway: class {
    connectionState = 'closed'
    connect = vi.fn(async () => {
      throw new Error('unexpected shared-primary dial')
    })
    onEvent = vi.fn(() => () => {})
    onState = vi.fn(() => () => {})
  }
}))
vi.mock('@/store/session', () => ({ setGatewayState: vi.fn() }))

const {
  $gateway,
  activeGatewayProfileKey,
  configureGatewayRegistry,
  ensureGatewayForProfile,
  requestGatewayForProfile,
  setPrimaryGateway
} = await import('./gateway')

function installDesktop(getConnection: ReturnType<typeof vi.fn>): void {
  ;(window as unknown as { hermesDesktop: unknown }).hermesDesktop = { getConnection }
}

beforeEach(() => configureGatewayRegistry({ onEvent: vi.fn() }))
afterEach(() => delete (window as unknown as { hermesDesktop?: unknown }).hermesDesktop)

describe('shared global-remote routing', () => {
  it('uses the primary socket for a tagged shared descriptor', async () => {
    const primary = { connectionState: 'open' }
    setPrimaryGateway(primary as never, 'default')
    installDesktop(vi.fn(async () => ({ profile: 'venture', token: 't' })))
    await ensureGatewayForProfile('venture')
    expect($gateway.get()).toBe(primary)
    expect(activeGatewayProfileKey()).toBe('venture')
  })

  it('still pools a socket for an untagged descriptor', async () => {
    const primary = { connectionState: 'open' }
    setPrimaryGateway(primary as never, 'default')
    installDesktop(vi.fn(async () => ({ token: 't2' })))
    await ensureGatewayForProfile('worker')
    expect($gateway.get()).not.toBe(primary)
  })

  it('scopes a shared-primary request without changing its socket', async () => {
    const request = vi.fn().mockResolvedValue({ ok: true })
    const primary = { connectionState: 'open', request }
    setPrimaryGateway(primary as never, 'default')
    installDesktop(vi.fn(async () => ({ profile: 'venture', token: 't' })))
    const before = $gateway.get()

    await expect(requestGatewayForProfile('venture', 'session.resume', { session_id: 's1' })).resolves.toEqual({
      ok: true
    })
    expect(request).toHaveBeenCalledWith('session.resume', { profile: 'venture', session_id: 's1' })
    expect($gateway.get()).toBe(before)
  })
})
