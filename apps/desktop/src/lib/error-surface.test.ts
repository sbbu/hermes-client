import { describe, expect, it } from 'vitest'

import { formatErrorDiagnostics, parseErrorSurface } from './error-surface'

describe('parseErrorSurface', () => {
  it('accepts valid descriptors and preserves failing-session identity', () => {
    expect(
      parseErrorSurface({
        layer: 'provider',
        code: 'rate_limit',
        retryable: false,
        provider: 'openrouter',
        model: 'test/m1'
      })
    ).toEqual({
      layer: 'provider',
      code: 'rate_limit',
      retryable: false,
      provider: 'openrouter',
      model: 'test/m1'
    })
  })

  it('rejects malformed descriptors', () => {
    expect(parseErrorSurface({ layer: 'unknown', code: 'x' })).toBeNull()
    expect(parseErrorSurface(null)).toBeNull()
  })
})

describe('formatErrorDiagnostics', () => {
  it('prefers descriptor identity and omits absent fields', () => {
    const text = formatErrorDiagnostics({
      errorText: 'boom',
      model: 'other/model',
      surface: { layer: 'provider', code: 'rate_limit', retryable: true, model: 'failed/model' }
    })

    expect(text).toContain('layer: provider')
    expect(text).toContain('model: failed/model')
    expect(text).not.toContain('other/model')
    expect(text.split('\n').every(line => line.trim())).toBe(true)
  })
})
