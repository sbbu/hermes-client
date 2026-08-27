import { afterEach, describe, expect, it, vi } from 'vitest'

import { getGlobalModelOptions } from '@/hermes'

import { reconcileSelectionAfterCatalogRefresh, requestModelOptions } from './model-options'

const globalOptions = { model: 'hermes-4', provider: 'nous', providers: [] }

vi.mock('@/hermes', () => ({
  getGlobalModelOptions: vi.fn(() => Promise.resolve(globalOptions))
}))

describe('requestModelOptions', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('uses the connected gateway even before a session exists', async () => {
    const gatewayPayload = { model: 'BeastMode', provider: 'moa', providers: [] }

    const gateway = {
      request: vi.fn(() => Promise.resolve(gatewayPayload))
    }

    await expect(requestModelOptions({ gateway: gateway as never, sessionId: null })).resolves.toBe(gatewayPayload)

    expect(gateway.request).toHaveBeenCalledWith('model.options', { explicit_only: true })
    expect(getGlobalModelOptions).not.toHaveBeenCalled()
  })

  it('passes the active session id and refresh flag through the gateway', async () => {
    const gateway = {
      request: vi.fn(() => Promise.resolve(globalOptions))
    }

    await requestModelOptions({ gateway: gateway as never, refresh: true, sessionId: 'session-1' })

    expect(gateway.request).toHaveBeenCalledWith('model.options', {
      explicit_only: true,
      refresh: true,
      session_id: 'session-1'
    })
  })

  it('falls back to REST when no gateway is connected', async () => {
    await requestModelOptions({ refresh: true })

    expect(getGlobalModelOptions).toHaveBeenCalledWith({ explicitOnly: true, refresh: true })
  })
})

describe('reconcileSelectionAfterCatalogRefresh', () => {
  const providers = [
    { models: ['preset'], name: 'MoA', slug: 'moa' },
    { models: ['model-a', 'model-b'], name: 'Provider', slug: 'provider' }
  ]

  it('keeps a selection that remains in the refreshed catalog', () => {
    expect(reconcileSelectionAfterCatalogRefresh('model-b', providers)).toBeNull()
  })

  it('selects the first real model when the old selection disappeared', () => {
    expect(reconcileSelectionAfterCatalogRefresh('removed', providers)).toEqual({
      model: 'model-a',
      provider: 'provider'
    })
  })

  it('does not clear the current selection for an empty catalog', () => {
    expect(reconcileSelectionAfterCatalogRefresh('current', [])).toBeNull()
  })
})
