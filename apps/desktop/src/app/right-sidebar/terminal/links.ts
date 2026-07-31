import { WebLinksAddon } from '@xterm/addon-web-links'
import type { ILinkHandler } from '@xterm/xterm'

import { openExternalLink } from '@/lib/external-link'

import { isMacPlatform } from './selection'

// Route both detected URLs and OSC 8 hyperlinks through the desktop bridge;
// Electron denies xterm's default window.open path. Match native terminals:
// Command-click on macOS, Ctrl-click elsewhere, while bare clicks select text.
export function isTerminalLinkActivation(
  event: Pick<MouseEvent, 'ctrlKey' | 'metaKey'>,
  isMac = isMacPlatform()
): boolean {
  return isMac ? event.metaKey : event.ctrlKey
}

const activate = (event: MouseEvent, uri: string) => {
  if (isTerminalLinkActivation(event)) {
    openExternalLink(uri)
  }
}

export const terminalLinkHandler: ILinkHandler = { activate }

export const terminalWebLinksAddon = () => new WebLinksAddon(activate)
