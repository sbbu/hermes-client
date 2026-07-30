import { afterEach, describe, expect, it } from 'vitest'

import { chatSurfaceRoot, clearSurfaceVar, setSurfaceVar, STATUS_STACK_VAR } from './surface-vars'

describe('surface measured-height vars', () => {
  afterEach(() => {
    document.documentElement.style.removeProperty(STATUS_STACK_VAR)
    document.body.replaceChildren()
  })

  function surface() {
    const root = document.createElement('div')
    root.setAttribute('data-chat-surface', '')
    const publisher = document.createElement('div')
    root.append(publisher)
    document.body.append(root)

    return { publisher, root }
  }

  it('publishes onto the owning surface, not the document root', () => {
    const { publisher, root } = surface()
    setSurfaceVar(publisher, STATUS_STACK_VAR, '176px')
    expect(root.style.getPropertyValue(STATUS_STACK_VAR)).toBe('176px')
    expect(document.documentElement.style.getPropertyValue(STATUS_STACK_VAR)).toBe('')
  })

  it('does not publish from a detached or unowned node', () => {
    const { publisher } = surface()
    publisher.remove()
    setSurfaceVar(publisher, STATUS_STACK_VAR, '176px')
    setSurfaceVar(document.createElement('div'), STATUS_STACK_VAR, '176px')
    expect(document.documentElement.style.getPropertyValue(STATUS_STACK_VAR)).toBe('')
  })

  it('resolves and clears the captured owner', () => {
    const { publisher, root } = surface()
    expect(chatSurfaceRoot(publisher)).toBe(root)
    setSurfaceVar(publisher, STATUS_STACK_VAR, '176px')
    clearSurfaceVar(root, STATUS_STACK_VAR)
    expect(root.style.getPropertyValue(STATUS_STACK_VAR)).toBe('')
    expect(() => clearSurfaceVar(null, STATUS_STACK_VAR)).not.toThrow()
  })
})
