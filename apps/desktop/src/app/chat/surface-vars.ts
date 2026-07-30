export const COMPOSER_HEIGHT_VAR = '--composer-measured-height'
export const COMPOSER_SURFACE_HEIGHT_VAR = '--composer-surface-measured-height'
export const STATUS_STACK_VAR = '--status-stack-measured-height'

/** Return the chat surface that owns a measurement publisher. */
export function chatSurfaceRoot(el: Element | null): HTMLElement | null {
  return el?.closest<HTMLElement>('[data-chat-surface]') ?? null
}

/** Publish only to the owning surface. Detached publishers must not poison :root. */
export function setSurfaceVar(el: Element | null, name: string, value: string): void {
  chatSurfaceRoot(el)?.style.setProperty(name, value)
}

export function clearSurfaceVar(root: HTMLElement | null, name: string): void {
  root?.style.removeProperty(name)
}
