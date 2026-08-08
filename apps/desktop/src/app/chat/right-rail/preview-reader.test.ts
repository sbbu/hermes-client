import { beforeEach, describe, expect, it } from 'vitest'

import { $rightRailActiveTabId, RIGHT_RAIL_PREVIEW_TAB_ID, selectRightRailTab } from '@/store/layout'
import { $filePreviewTabs, $previewTarget, filePreviewTabId, type PreviewTarget } from '@/store/preview'

import { PREVIEW_READ_MAX_CHARS, readActivePreview, registerPreviewPageReader } from './preview-reader'

const urlTarget = (url: string): PreviewTarget => ({ kind: 'url', label: 'Browser', source: url, url })

const fileTarget = (path: string): PreviewTarget => ({
  kind: 'file',
  label: path,
  path,
  previewKind: 'text',
  source: path,
  url: `file://${path}`
})

describe('readActivePreview', () => {
  let cleanups: Array<() => void> = []

  beforeEach(() => {
    cleanups.forEach(cleanup => cleanup())
    cleanups = []
    $previewTarget.set(null)
    $filePreviewTabs.set([])
    selectRightRailTab(RIGHT_RAIL_PREVIEW_TAB_ID)
  })

  const register = (reader: Parameters<typeof registerPreviewPageReader>[0]) => {
    const cleanup = registerPreviewPageReader(reader)
    cleanups.push(cleanup)

    return cleanup
  }

  it('returns null when no preview is open', async () => {
    expect(await readActivePreview()).toBeNull()
  })

  it('serializes the live browser page and windows its visible text', async () => {
    $previewTarget.set(urlTarget('https://example.com'))
    register(async () => ({ text: 'abcdefghij', title: 'Example', url: 'https://example.com/next' }))

    expect(await readActivePreview({ count: 4, start: 2 })).toMatchObject({
      end: 6,
      kind: 'url',
      start: 2,
      text: 'cdef',
      title: 'Example',
      total_chars: 10,
      url: 'https://example.com/next'
    })
  })

  it('caps one response and falls back to identity while the webview is unavailable', async () => {
    $previewTarget.set(urlTarget('https://example.com'))
    register(async () => ({ text: 'x'.repeat(PREVIEW_READ_MAX_CHARS + 10), title: '', url: '' }))

    expect((await readActivePreview({ count: PREVIEW_READ_MAX_CHARS + 10 }))?.text).toHaveLength(PREVIEW_READ_MAX_CHARS)

    register(async () => {
      throw new Error('not ready')
    })

    expect(await readActivePreview()).toMatchObject({ note: expect.stringContaining('retry'), text: '' })
  })

  it('reads the selected file tab identity instead of the browser reader', async () => {
    const target = fileTarget('/work/notes.md')
    const id = filePreviewTabId(target)
    $previewTarget.set(urlTarget('https://example.com'))
    $filePreviewTabs.set([{ id, target }])
    register(async () => ({ text: 'browser', title: 'Browser', url: 'https://example.com' }))
    selectRightRailTab(id)

    expect($rightRailActiveTabId.get()).toBe(id)
    expect(await readActivePreview()).toMatchObject({
      kind: 'file',
      note: expect.stringContaining('read_file'),
      path: '/work/notes.md',
      text: ''
    })
  })

  it('does not let stale cleanup evict a newer reader', async () => {
    $previewTarget.set(urlTarget('https://example.com'))
    const first = register(async () => ({ text: 'first', title: '', url: '' }))
    register(async () => ({ text: 'second', title: '', url: '' }))
    first()

    expect(await readActivePreview()).toMatchObject({ text: 'second' })
  })
})
