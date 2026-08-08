import { act, cleanup, render, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ErrorBoundary, RootErrorBoundary } from './error-boundary'

const lookupError = new Error('useClientLookup: Index 6 out of bounds (length: 2)')

function Bomb({ error }: { error: Error | null }) {
  if (error) {
    throw error
  }

  return <div>recovered</div>
}

describe('root assistant-ui lookup recovery', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('recovers the production root composition through StrictMode replay', () => {
    const view = render(
      <StrictMode>
        <RootErrorBoundary>
          <Bomb error={lookupError} />
        </RootErrorBoundary>
      </StrictMode>
    )

    view.rerender(
      <StrictMode>
        <RootErrorBoundary>
          <Bomb error={null} />
        </RootErrorBoundary>
      </StrictMode>
    )
    act(() => vi.runOnlyPendingTimers())

    expect(screen.getByText('recovered')).toBeTruthy()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('bounds persistent automatic retries', () => {
    render(
      <RootErrorBoundary>
        <Bomb error={lookupError} />
      </RootErrorBoundary>
    )

    for (let attempt = 0; attempt < 4; attempt += 1) {
      act(() => vi.runOnlyPendingTimers())
    }

    expect(screen.getByRole('button', { name: 'Reload window' })).toBeTruthy()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not auto-recover unrelated or scoped errors', () => {
    render(
      <ErrorBoundary fallback={() => <div>scoped fallback</div>} label="thread">
        <Bomb error={lookupError} />
      </ErrorBoundary>
    )
    act(() => vi.runAllTimers())
    expect(screen.getByText('scoped fallback')).toBeTruthy()
  })
})
