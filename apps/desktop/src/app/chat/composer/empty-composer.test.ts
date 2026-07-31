import { describe, expect, it } from 'vitest'

import { composerPlainText, normalizeComposerEditorDom, RICH_INPUT_SLOT } from './rich-editor'

function editor(): HTMLDivElement {
  const el = document.createElement('div')

  el.dataset.slot = RICH_INPUT_SLOT
  el.contentEditable = 'true'
  document.body.append(el)

  return el
}

function emptied(): HTMLDivElement {
  const el = editor()

  el.append(document.createTextNode('hello'))
  el.replaceChildren()
  normalizeComposerEditorDom(el)

  return el
}

describe('an emptied composer reads as empty', () => {
  it('does not read Chromium\u2019s placeholder break as content', () => {
    const el = emptied()

    el.append(document.createElement('br'))

    expect(composerPlainText(el)).toBe('')
  })

  it('still reads real line breaks', () => {
    const el = editor()

    el.append(document.createTextNode('one'), document.createElement('br'), document.createTextNode('two'))
    expect(composerPlainText(el)).toBe('one\ntwo')
  })

  it('does not widen the editor-root exemption to nested breaks', () => {
    const el = editor()
    const inner = document.createElement('div')

    inner.append(document.createElement('br'))
    el.append(document.createTextNode('one'), inner)
    expect(composerPlainText(el)).toBe('one\n\n')
  })
})
