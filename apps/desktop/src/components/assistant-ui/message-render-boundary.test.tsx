import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { MessageRenderBoundary } from './message-render-boundary'

afterEach(cleanup)

function Boom({ error }: { error: Error | null }): null {
  if (error) {
    throw error
  }

  return null
}

const lookupError = new Error('useClientLookup: Index 2 out of bounds (length: 2)')

const lookupErrors = [
  ['useClientLookup', lookupError],
  ['tapClientLookup', new Error('tapClientLookup: Index 2 out of bounds (length: 2)')],
  ['tapClientResource', new Error('tapClientResource: Index 2 out of bounds (length: 2)')]
] as const

describe('MessageRenderBoundary', () => {
  it('renders children when nothing throws', () => {
    render(
      <MessageRenderBoundary resetKey="a">
        <div>content</div>
      </MessageRenderBoundary>
    )

    expect(screen.getByText('content')).toBeTruthy()
  })

  it.each(lookupErrors)('swallows the transient %s out-of-bounds store race', (_label, error) => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const { container } = render(
      <MessageRenderBoundary resetKey="a">
        <Boom error={error} />
      </MessageRenderBoundary>
    )

    expect(container.innerHTML).toBe('')
    spy.mockRestore()
  })

  it('recovers on the next consistent snapshot when resetKey changes', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const { rerender } = render(
      <MessageRenderBoundary resetKey="a">
        <Boom error={lookupError} />
      </MessageRenderBoundary>
    )

    rerender(
      <MessageRenderBoundary resetKey="b">
        <Boom error={null} />
      </MessageRenderBoundary>
    )

    rerender(
      <MessageRenderBoundary resetKey="b">
        <div>recovered</div>
      </MessageRenderBoundary>
    )

    expect(screen.getByText('recovered')).toBeTruthy()
    spy.mockRestore()
  })

  it('re-throws unrelated errors so real bugs still surface', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    expect(() =>
      render(
        <MessageRenderBoundary resetKey="a">
          <Boom error={new Error('genuine render bug')} />
        </MessageRenderBoundary>
      )
    ).toThrow('genuine render bug')

    spy.mockRestore()
  })
})
