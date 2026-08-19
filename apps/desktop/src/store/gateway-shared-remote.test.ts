import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const gatewayMocks = vi.hoisted(() => ({
  connect: vi.fn(async (_wsUrl: string): Promise<void> => {
    throw new Error('unexpected shared-primary dial')
  })
}))

vi.mock('@/hermes', () => ({
  HermesGateway: class {
    connectionState = 'closed'
    connect = gatewayMocks.connect
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
afterEach(() => {
  vi.clearAllMocks()
  delete (window as unknown as { hermesDesktop?: unknown }).hermesDesktop
})

describe('shared global-remote routing', () => {
  it('uses the primary socket for an explicitly shared descriptor', async () => {
    const primary = { connectionState: 'open' }
    setPrimaryGateway(primary as never, 'default')
    installDesktop(vi.fn(async () => ({ profile: 'venture', sharedPrimary: true, token: 't' })))
    await ensureGatewayForProfile('venture')
    expect(gatewayMocks.connect).not.toHaveBeenCalled()
    expect($gateway.get()).toBe(primary)
    expect(activeGatewayProfileKey()).toBe('venture')
  })

  it('dials a pooled profile descriptor that also carries a profile tag', async () => {
    const primary = { connectionState: 'open' }
    const wsUrl = 'wss://worker.invalid/api/ws?token=fake-test-token'
    setPrimaryGateway(primary as never, 'default')
    installDesktop(
      vi.fn(async () => ({
        authMode: 'token',
        baseUrl: 'https://worker.invalid',
        mode: 'remote',
        profile: 'worker',
        token: 'fake-test-token',
        wsUrl
      }))
    )
    gatewayMocks.connect.mockResolvedValueOnce(undefined)
    await ensureGatewayForProfile('worker')
    expect(gatewayMocks.connect).toHaveBeenCalledOnce()
    expect(gatewayMocks.connect).toHaveBeenCalledWith(wsUrl)
    expect($gateway.get()).not.toBe(primary)
  })

  it('scopes a shared-primary request without changing its socket', async () => {
    const request = vi.fn().mockResolvedValue({ ok: true })
    const primary = { connectionState: 'open', request }
    setPrimaryGateway(primary as never, 'default')
    installDesktop(vi.fn(async () => ({ profile: 'venture', sharedPrimary: true, token: 't' })))
    const before = $gateway.get()

    await expect(requestGatewayForProfile('venture', 'session.resume', { session_id: 's1' })).resolves.toEqual({
      ok: true
    })
    expect(request).toHaveBeenCalledWith('session.resume', { profile: 'venture', session_id: 's1' })
    expect($gateway.get()).toBe(before)
  })
})
