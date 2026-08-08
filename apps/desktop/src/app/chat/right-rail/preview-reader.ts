import { $rightRailActiveTabId, RIGHT_RAIL_PREVIEW_TAB_ID } from '@/store/layout'
import { $filePreviewTabs, $previewTarget, type PreviewTarget } from '@/store/preview'

export interface PreviewReadOptions {
  count?: number
  start?: number
}

export interface PreviewReadResult {
  end: number
  kind: string
  note?: string
  path?: string
  start: number
  text: string
  title: string
  total_chars: number
  url: string
}

interface PreviewPage {
  text: string
  title: string
  url: string
}

type PageReader = () => Promise<PreviewPage>

export const PREVIEW_READ_MAX_CHARS = 24_000

let pageReader: PageReader | null = null

export function registerPreviewPageReader(reader: PageReader): () => void {
  pageReader = reader

  return () => {
    if (pageReader === reader) {
      pageReader = null
    }
  }
}

function activeTarget(): PreviewTarget | null {
  const activeTabId = $rightRailActiveTabId.get()

  if (activeTabId === RIGHT_RAIL_PREVIEW_TAB_ID) {
    return $previewTarget.get()
  }

  return $filePreviewTabs.get().find(tab => tab.id === activeTabId)?.target ?? null
}

function windowText(
  base: Omit<PreviewReadResult, 'end' | 'start' | 'text' | 'total_chars'>,
  text: string,
  opts: PreviewReadOptions
): PreviewReadResult {
  const total = text.length
  const from = Math.max(0, Math.min(opts.start ?? 0, total))
  const want = Math.min(Math.max(1, opts.count ?? PREVIEW_READ_MAX_CHARS), PREVIEW_READ_MAX_CHARS)
  const to = Math.max(from, Math.min(from + want, total))

  return { ...base, end: to, start: from, text: text.slice(from, to), total_chars: total }
}

export async function readActivePreview(opts: PreviewReadOptions = {}): Promise<PreviewReadResult | null> {
  const target = activeTarget()

  if (!target) {
    return null
  }

  if ($rightRailActiveTabId.get() === RIGHT_RAIL_PREVIEW_TAB_ID && pageReader) {
    try {
      const page = await pageReader()

      return windowText(
        { kind: target.kind, path: target.path, title: page.title || target.label, url: page.url || target.url },
        page.text,
        opts
      )
    } catch {
      // The webview can be between navigations; return identity so callers can retry.
    }
  }

  return windowText(
    {
      kind: target.kind,
      note:
        target.kind === 'file'
          ? 'File preview — read the file itself with read_file.'
          : 'The page has not finished loading — retry in a moment.',
      path: target.path,
      title: target.label,
      url: target.url
    },
    '',
    opts
  )
}
