const MAX_HTML_DEPTH = 300

const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr'
])

const TAG_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g

export function clampHtmlNestingDepth(text: string): string {
  if (!text.includes('<')) {
    return text
  }

  const open: string[] = []
  let firstOverflow = -1
  let match: RegExpExecArray | null
  TAG_RE.lastIndex = 0

  while ((match = TAG_RE.exec(text)) !== null) {
    const name = match[2].toLowerCase()

    if (match[1] === '/') {
      const index = open.lastIndexOf(name)

      if (index !== -1) {
        open.length = index
      }
    } else if (!match[3].endsWith('/') && !VOID_ELEMENTS.has(name)) {
      open.push(name)

      if (open.length > MAX_HTML_DEPTH && firstOverflow === -1) {
        firstOverflow = match.index
      }
    }
  }

  return firstOverflow === -1 ? text : text.slice(0, firstOverflow) + text.slice(firstOverflow).replaceAll('<', '&lt;')
}
