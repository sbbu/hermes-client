import { describe, expect, it } from 'vitest'

import { coerceRemoteUrlScheme } from './remote-url'

describe('coerceRemoteUrlScheme', () => {
  it('prepends http:// to scheme-less remote hosts', () => {
    expect(coerceRemoteUrlScheme('100.64.0.1:9119')).toBe('http://100.64.0.1:9119')
    expect(coerceRemoteUrlScheme('host.example:9119')).toBe('http://host.example:9119')
    expect(coerceRemoteUrlScheme('localhost:9119')).toBe('http://localhost:9119')
  })

  it('preserves explicit schemes and trims empty input', () => {
    expect(coerceRemoteUrlScheme('https://host.example/path')).toBe('https://host.example/path')
    expect(coerceRemoteUrlScheme('ws://host:9119')).toBe('ws://host:9119')
    expect(coerceRemoteUrlScheme('   ')).toBe('')
  })
})
