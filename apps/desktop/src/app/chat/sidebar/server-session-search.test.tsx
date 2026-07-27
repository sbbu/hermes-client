import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SessionSearchResponse, SessionSearchResult } from '@/hermes'

import { useServerSessionSearch } from './server-session-search'

const { searchSessionsMock } = vi.hoisted(() => ({ searchSessionsMock: vi.fn() }))

vi.mock('@/hermes', () => ({ searchSessions: searchSessionsMock }))

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void

  const promise = new Promise<T>(done => {
    resolve = done
  })

  return { promise, resolve }
}

function result(sessionId: string): SessionSearchResult {
  return {
    model: null,
    role: 'assistant',
    session_id: sessionId,
    session_started: 1,
    snippet: 'match',
    source: 'cli'
  }
}

function Harness({ profile, query }: { profile: string; query: string }) {
  const matches = useServerSessionSearch(query, profile)

  return <div data-testid="matches">{matches.map(match => `${match.profile}:${match.session_id}`).join(',')}</div>
}

describe('useServerSessionSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    searchSessionsMock.mockReset()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('routes the request and rejects a late response from the previous profile', async () => {
    const alpha = deferred<SessionSearchResponse>()
    const beta = deferred<SessionSearchResponse>()
    searchSessionsMock.mockReturnValueOnce(alpha.promise).mockReturnValueOnce(beta.promise)

    const view = render(<Harness profile="alpha" query="needle" />)
    act(() => vi.advanceTimersByTime(200))
    expect(searchSessionsMock).toHaveBeenNthCalledWith(1, 'needle', 'alpha')

    view.rerender(<Harness profile="beta" query="needle" />)
    act(() => vi.advanceTimersByTime(200))
    expect(searchSessionsMock).toHaveBeenNthCalledWith(2, 'needle', 'beta')

    await act(async () => alpha.resolve({ results: [result('same-id')] }))
    expect(view.getByTestId('matches').textContent).toBe('')

    await act(async () => beta.resolve({ results: [result('same-id')] }))
    expect(view.getByTestId('matches').textContent).toBe('beta:same-id')
  })

  it('hides resolved results immediately when their profile identity changes', async () => {
    searchSessionsMock.mockResolvedValue({ results: [result('session-1')] })

    const view = render(<Harness profile="alpha" query="needle" />)
    await act(async () => vi.advanceTimersByTime(200))
    expect(view.getByTestId('matches').textContent).toBe('alpha:session-1')

    view.rerender(<Harness profile="beta" query="needle" />)
    expect(view.getByTestId('matches').textContent).toBe('')
  })
})
