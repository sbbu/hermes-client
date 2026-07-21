/**
 * Soft focus / type-to-focus for the chat composer.
 *
 * On empty chat chrome, Enter focuses the composer; printable keys focus and
 * type. Bound shortcuts still win via the keybind index. Surfaces that own
 * keys (dialogs, menus, terminal, full pages, …) are left alone.
 */

import { isNewChatRoute, routeSessionId } from '@/app/routes'
import { switcherActive } from '@/store/session-switcher'

import { isEditableTarget } from './combo'

/** `composer.focus` defaults that need the surface/target gate. */
export const isComposerFocusSoftCombo = (combo: string) => combo === '/' || combo === 'enter'

const ENTER_ACTIVATES = [
  'a[href]',
  'button',
  'summary',
  'input',
  'textarea',
  'select',
  '[contenteditable=""]',
  '[contenteditable="true"]',
  '[role="button"]',
  '[role="checkbox"]',
  '[role="combobox"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="menuitemcheckbox"]',
  '[role="menuitemradio"]',
  '[role="option"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="tab"]',
  '[role="treeitem"]'
].join(',')

const BLOCKING_SURFACE =
  '[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"],[data-radix-popper-content-wrapper]'

const isFocusWithin = (selector: string): boolean =>
  Boolean((document.activeElement as HTMLElement | null)?.closest(selector))

/** True when the focused control would normally handle Enter itself. */
export function isActivateOnEnterTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null

  return Boolean(el && el !== document.body && el !== document.documentElement && el.closest(ENTER_ACTIVATES))
}

/** Dialogs, menus, terminal, full pages, session switcher — they keep their keys. */
export function composerFocusBlockedBySurface(): boolean {
  const rawPathname = window.location.pathname
  const pathname = rawPathname.length > 1 ? rawPathname.replace(/\/+$/, '') : rawPathname
  const isChatRoute = isNewChatRoute(pathname) || routeSessionId(pathname) !== null

  return (
    switcherActive() ||
    !isChatRoute ||
    isFocusWithin('[data-terminal]') ||
    Boolean(document.querySelector(BLOCKING_SURFACE))
  )
}

/** Printable `event.key` for type-to-focus, or null (modifiers / non-printables / IME). */
export function typeToFocusChar(event: KeyboardEvent): string | null {
  if (event.defaultPrevented || event.isComposing || event.metaKey || event.ctrlKey || event.altKey) {
    return null
  }

  return event.key.length === 1 ? event.key : null
}

/** Whether soft focus / type-to-focus may run. */
export function composerFocusKeysAllowed(event: KeyboardEvent, combo: string): boolean {
  if (combo !== 'type' && !isComposerFocusSoftCombo(combo)) {
    return true
  }

  if (
    event.defaultPrevented ||
    event.isComposing ||
    isEditableTarget(event.target) ||
    composerFocusBlockedBySurface()
  ) {
    return false
  }

  // Space activates focused buttons/checkboxes/radios just like Enter. Do not
  // steal that native activation merely because space is printable.
  if (combo === 'type' && event.key === ' ' && isActivateOnEnterTarget(event.target)) {
    return false
  }

  return !(combo === 'enter' && isActivateOnEnterTarget(event.target))
}
