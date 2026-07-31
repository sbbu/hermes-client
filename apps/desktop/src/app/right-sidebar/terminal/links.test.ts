import type { ILink, Terminal as TerminalType } from '@xterm/xterm'
import { Terminal } from '@xterm/xterm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { isTerminalLinkActivation, terminalLinkHandler, terminalWebLinksAddon } from './links'

const openExternal = vi.fn()
const click = (init: Partial<MouseEvent> = {}) => ({ ctrlKey: false, metaKey: false, ...init })

beforeEach(() => {
  openExternal.mockClear()
  Object.defineProperty(window, 'hermesDesktop', { configurable: true, value: { openExternal } })
  Object.defineProperty(navigator, 'platform', { configurable: true, value: 'MacIntel' })
})

async function clickLinkIn(text: string, event: MouseEvent) {
  const term = new Terminal({ allowProposedApi: true, cols: 80, rows: 10 })
  const providers: Array<Parameters<TerminalType['registerLinkProvider']>[0]> = []
  const register = term.registerLinkProvider.bind(term)

  term.registerLinkProvider = provider => {
    providers.push(provider)

    return register(provider)
  }

  term.loadAddon(terminalWebLinksAddon())
  await new Promise<void>(resolve => term.write(`${text}\r\n`, resolve))

  const links = await new Promise<ILink[]>(resolve => providers[0].provideLinks(1, found => resolve(found ?? [])))
  links[0]?.activate(event, links[0].text)

  return links[0]?.text
}

describe('terminal links', () => {
  it('opens a command-clicked URL through the desktop bridge', async () => {
    const uri = 'https://example.com/path'

    expect(await clickLinkIn(uri, new MouseEvent('click', { metaKey: true }))).toBe(uri)
    expect(openExternal).toHaveBeenCalledWith(uri)
  })

  it('leaves a bare click to selection', async () => {
    await clickLinkIn('https://example.com/path', new MouseEvent('click'))
    expect(openExternal).not.toHaveBeenCalled()
  })

  it('routes OSC 8 hyperlinks through the bridge', () => {
    terminalLinkHandler.activate(new MouseEvent('click', { metaKey: true }), 'https://example.com/osc8', {
      end: { x: 10, y: 1 },
      start: { x: 1, y: 1 }
    })
    expect(openExternal).toHaveBeenCalledWith('https://example.com/osc8')
  })
})

describe('isTerminalLinkActivation', () => {
  it('takes the platform modifier', () => {
    expect(isTerminalLinkActivation(click({ metaKey: true }), true)).toBe(true)
    expect(isTerminalLinkActivation(click({ ctrlKey: true }), false)).toBe(true)
  })

  it('keeps Ctrl-click free on macOS', () => {
    expect(isTerminalLinkActivation(click({ ctrlKey: true }), true)).toBe(false)
  })
})
