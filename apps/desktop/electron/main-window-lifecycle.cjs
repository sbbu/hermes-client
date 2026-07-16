'use strict'

function ensureMainWindow(window, { isReady, createWindow, focusWindow, focusExisting = true }) {
  if (!window || window.isDestroyed()) {
    if (isReady) {
      createWindow()
    }

    return
  }

  if (focusExisting) {
    focusWindow(window)
  }
}

module.exports = { ensureMainWindow }
