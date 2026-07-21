import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { $switcherOpen, closeSwitcher } from '@/store/session-switcher'

import {
  composerFocusBlockedBySurface,
  composerFocusKeysAllowed,
  isActivateOnEnterTarget,
  typeToFocusChar
} from './composer-focus-keys'

function keydown(init: KeyboardEventInit & { target?: EventTarget }): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })

  if (init.target) {
    Object.defineProperty(event, 'target', { value: init.target })
  }

  return event
}

describe('isActivateOnEnterTarget', () => {
  it('ignores body / null', () => {
    expect(isActivateOnEnterTarget(document.body)).toBe(false)
    expect(isActivateOnEnterTarget(null)).toBe(false)
  })

  it('detects buttons and walks to a wrapping activator', () => {
    const button = document.createElement('button')
    const wrap = document.createElement('div')
    wrap.setAttribute('role', 'button')
    const child = document.createElement('span')
    wrap.append(child)
    document.body.append(button, wrap)

    expect(isActivateOnEnterTarget(button)).toBe(true)
    expect(isActivateOnEnterTarget(child)).toBe(true)
    expect(isActivateOnEnterTarget(document.createElement('div'))).toBe(false)
  })
})

describe('composerFocusBlockedBySurface', () => {
  beforeEach(() => {
    closeSwitcher()
    document.body.replaceChildren()
    window.history.replaceState({}, '', '/')
  })

  afterEach(() => {
    closeSwitcher()
    document.body.replaceChildren()
    window.history.replaceState({}, '', '/')
  })

  it('is clear on empty chat chrome', () => {
    expect(composerFocusBlockedBySurface()).toBe(false)
  })

  it('blocks dialogs, the session switcher, and full pages', () => {
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    document.body.append(dialog)
    expect(composerFocusBlockedBySurface()).toBe(true)

    document.body.replaceChildren()
    $switcherOpen.set(true)
    expect(composerFocusBlockedBySurface()).toBe(true)

    closeSwitcher()
    window.history.replaceState({}, '', '/settings')
    expect(composerFocusBlockedBySurface()).toBe(true)

    window.history.replaceState({}, '', '/settings/')
    expect(composerFocusBlockedBySurface()).toBe(true)
  })

  it('blocks when focus is inside a terminal', () => {
    const term = document.createElement('div')
    term.setAttribute('data-terminal', '')
    const inner = document.createElement('div')
    term.append(inner)
    document.body.append(term)
    vi.spyOn(document, 'activeElement', 'get').mockReturnValue(inner)

    expect(composerFocusBlockedBySurface()).toBe(true)
  })
})

describe('typeToFocusChar', () => {
  it('returns printables (case/symbols via event.key)', () => {
    expect(typeToFocusChar(keydown({ key: 'a', code: 'KeyA' }))).toBe('a')
    expect(typeToFocusChar(keydown({ key: 'A', code: 'KeyA', shiftKey: true }))).toBe('A')
    expect(typeToFocusChar(keydown({ key: '?', code: 'Slash', shiftKey: true }))).toBe('?')
    expect(typeToFocusChar(keydown({ key: ' ', code: 'Space' }))).toBe(' ')
  })

  it('rejects non-printables and modified chords', () => {
    expect(typeToFocusChar(keydown({ key: 'Enter', code: 'Enter' }))).toBeNull()
    expect(typeToFocusChar(keydown({ key: 'a', code: 'KeyA', metaKey: true }))).toBeNull()
    expect(typeToFocusChar(keydown({ key: 'a', code: 'KeyA', isComposing: true }))).toBeNull()
  })
})

describe('composerFocusKeysAllowed', () => {
  beforeEach(() => {
    closeSwitcher()
    document.body.replaceChildren()
    window.history.replaceState({}, '', '/')
    vi.spyOn(document, 'activeElement', 'get').mockReturnValue(document.body)
  })

  afterEach(() => {
    closeSwitcher()
    document.body.replaceChildren()
    window.history.replaceState({}, '', '/')
    vi.restoreAllMocks()
  })

  it('passes rebound chords; allows soft keys on the transcript', () => {
    expect(composerFocusKeysAllowed(keydown({ key: 'i', code: 'KeyI', metaKey: true }), 'mod+i')).toBe(true)
    expect(composerFocusKeysAllowed(keydown({ key: '/', code: 'Slash', target: document.body }), '/')).toBe(true)
    expect(composerFocusKeysAllowed(keydown({ key: 'Enter', code: 'Enter', target: document.body }), 'enter')).toBe(
      true
    )
    expect(composerFocusKeysAllowed(keydown({ key: 'h', code: 'KeyH', target: document.body }), 'type')).toBe(true)
  })

  it('refuses editables; refuses Enter on buttons but allows / and typing', () => {
    const input = document.createElement('input')
    const button = document.createElement('button')
    document.body.append(input, button)

    expect(composerFocusKeysAllowed(keydown({ key: 'a', code: 'KeyA', target: input }), 'type')).toBe(false)
    expect(composerFocusKeysAllowed(keydown({ key: 'Enter', code: 'Enter', target: button }), 'enter')).toBe(false)
    expect(composerFocusKeysAllowed(keydown({ key: ' ', code: 'Space', target: button }), 'type')).toBe(false)
    expect(composerFocusKeysAllowed(keydown({ key: '/', code: 'Slash', target: button }), '/')).toBe(true)
    expect(composerFocusKeysAllowed(keydown({ key: 'a', code: 'KeyA', target: button }), 'type')).toBe(true)
  })

  it('refuses when a dialog is open', () => {
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    document.body.append(dialog)

    expect(composerFocusKeysAllowed(keydown({ key: 'a', code: 'KeyA', target: document.body }), 'type')).toBe(false)
  })
})
