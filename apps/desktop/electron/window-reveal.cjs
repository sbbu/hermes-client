'use strict'

const WINDOW_REVEAL_FALLBACK_MS = 4_000

function createWindowRevealController(
  window,
  {
    onRevealed = () => {},
    delayMs = WINDOW_REVEAL_FALLBACK_MS,
    setTimer = (callback, delay) => setTimeout(callback, delay),
    clearTimer = timer => clearTimeout(timer)
  } = {}
) {
  let disposed = false
  let revealed = false
  let fallbackTimer = null

  const cancelFallback = () => {
    if (fallbackTimer === null) return
    clearTimer(fallbackTimer)
    fallbackTimer = null
  }

  const reveal = () => {
    if (disposed || revealed || window.isDestroyed()) return false

    revealed = true
    cancelFallback()
    if (!window.isVisible()) window.show()
    onRevealed()

    return true
  }

  const scheduleFallback = () => {
    if (disposed || revealed || fallbackTimer !== null || window.isDestroyed()) return

    fallbackTimer = setTimer(() => {
      fallbackTimer = null
      reveal()
    }, delayMs)
  }

  const dispose = () => {
    disposed = true
    cancelFallback()
  }

  return { dispose, reveal, scheduleFallback }
}

module.exports = { WINDOW_REVEAL_FALLBACK_MS, createWindowRevealController }
