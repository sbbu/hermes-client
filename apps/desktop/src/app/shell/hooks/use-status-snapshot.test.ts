import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getLogs, getStatus } from '@/hermes'

import { useStatusSnapshot } from './use-status-snapshot'

vi.mock('@/hermes', () => ({
  getLogs: vi.fn(),
  getStatus: vi.fn()
}))

type GatewayRequester = <T = unknown>(method: string, params?: Record<string, unknown>) => Promise<T>

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined

  const promise = new Promise<T>(nextResolve => {
    resolve = nextResolve
  })

  return { promise, resolve }
}

async function flushAsync() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.mocked(getStatus)
    .mockReset()
    .mockResolvedValue({} as never)
  vi.mocked(getLogs)
    .mockReset()
    .mockResolvedValue({ lines: [] } as never)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('useStatusSnapshot', () => {
  it('keeps the last authoritative readiness through transient RPC failure', async () => {
    let refresh = 0

    const requestGateway = vi.fn(async (method: string) => {
      const cycle = Math.floor(refresh / 2)
      refresh += 1

      if (cycle > 0) {
        throw new Error(`${method} timed out`)
      }

      return (method === 'setup.runtime_check' ? { ok: true } : { provider_configured: true }) as never
    }) as unknown as GatewayRequester

    const { result } = renderHook(() => useStatusSnapshot('open', requestGateway))
    await flushAsync()
    expect(result.current.inferenceStatus).toMatchObject({ ready: true, source: 'runtime_check' })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000)
    })
    expect(result.current.inferenceStatus).toMatchObject({ ready: true, source: 'runtime_check' })
  })

  it('clears readiness immediately when the gateway disconnects', async () => {
    const pendingStatus = deferred<never>()
    vi.mocked(getStatus)
      .mockResolvedValueOnce({} as never)
      .mockReturnValueOnce(pendingStatus.promise)

    const requestGateway = vi.fn(
      async (method: string) =>
        (method === 'setup.runtime_check' ? { ok: true } : { provider_configured: true }) as never
    ) as unknown as GatewayRequester

    const { rerender, result } = renderHook(({ state }) => useStatusSnapshot(state, requestGateway), {
      initialProps: { state: 'open' }
    })

    await flushAsync()
    expect(result.current.inferenceStatus).toMatchObject({ ready: true })

    rerender({ state: 'connecting' })
    expect(result.current.inferenceStatus).toBeNull()
  })

  it('does not overlap a slow readiness refresh', async () => {
    const setup = deferred<unknown>()
    const runtime = deferred<unknown>()

    const requestGatewayMock = vi.fn(
      (method: string) => (method === 'setup.runtime_check' ? runtime.promise : setup.promise) as never
    )

    const requestGateway = requestGatewayMock as unknown as GatewayRequester

    renderHook(() => useStatusSnapshot('open', requestGateway))
    await flushAsync()
    expect(requestGatewayMock).toHaveBeenCalledTimes(2)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })
    expect(requestGatewayMock).toHaveBeenCalledTimes(2)

    await act(async () => {
      setup.resolve({ provider_configured: true })
      runtime.resolve({ ok: true })
      await vi.advanceTimersByTimeAsync(15_000)
    })
    expect(requestGatewayMock).toHaveBeenCalledTimes(4)
  })
})
