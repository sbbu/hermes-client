import { act, cleanup, render, screen } from '@testing-library/react'
import { Profiler, type ProfilerOnRenderCallback } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { GlyphSpinner } from './glyph-spinner'

describe('GlyphSpinner', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(document, 'hasFocus').mockReturnValue(true)
  })

  afterEach(() => {
    cleanup()
    vi.clearAllTimers()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('advances without an update-phase React commit', () => {
    let updateCommits = 0

    const onRender: ProfilerOnRenderCallback = (_id, phase) => {
      if (phase !== 'mount') {
        updateCommits++
      }
    }

    render(
      <Profiler id="spinner" onRender={onRender}>
        <GlyphSpinner spinner="braille" />
      </Profiler>
    )

    const status = screen.getByRole('status', { name: 'Loading' })
    const first = status.textContent
    act(() => vi.advanceTimersByTime(80))
    expect(status.textContent).not.toBe(first)
    expect(updateCommits).toBe(0)
  })

  it('suspends while the window is inactive', () => {
    render(<GlyphSpinner spinner="braille" />)
    const status = screen.getByRole('status', { name: 'Loading' })
    expect(vi.getTimerCount()).toBe(1)

    act(() => window.dispatchEvent(new Event('blur')))
    expect(vi.getTimerCount()).toBe(0)
    const frozen = status.textContent
    act(() => vi.advanceTimersByTime(800))
    expect(status.textContent).toBe(frozen)

    act(() => window.dispatchEvent(new Event('focus')))
    expect(vi.getTimerCount()).toBe(1)
  })
})
