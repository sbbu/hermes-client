/**
 * Pure helpers for window zoom. The main process owns webContents.setZoomLevel,
 * so the menu items, the Ctrl/Cmd shortcuts, and the settings UI all funnel
 * through this one clamped scale. Percent is the user-facing unit (100 = the
 * default size); Chromium's internal unit is the zoom level, where
 * factor = 1.2 ^ level.
 */

const ZOOM_STORAGE_KEY = 'hermes:desktop:zoomLevel'

const ZOOM_FACTOR_BASE = 1.2
const MIN_ZOOM_LEVEL = -9
const MAX_ZOOM_LEVEL = 9
const ZOOM_REASSERT_WINDOW_EVENTS = ['show', 'restore', 'moved']

function clampZoomLevel(value) {
  if (!Number.isFinite(value)) return 0
  return Math.min(Math.max(value, MIN_ZOOM_LEVEL), MAX_ZOOM_LEVEL)
}

function zoomLevelToPercent(level) {
  return Math.round(Math.pow(ZOOM_FACTOR_BASE, clampZoomLevel(level)) * 100)
}

function percentToZoomLevel(percent) {
  if (!Number.isFinite(percent) || percent <= 0) return 0
  return clampZoomLevel(Math.log(percent / 100) / Math.log(ZOOM_FACTOR_BASE))
}

// Chromium can drop webContents zoom after minimize/restore or a cross-display
// move onto a monitor with different scaling.
function installZoomReassertOnWindowEvents(win, reassert) {
  if (!win?.on) return

  for (const event of ZOOM_REASSERT_WINDOW_EVENTS) {
    win.on(event, () => {
      if (win.isDestroyed?.()) return
      reassert()
    })
  }
}

module.exports = {
  ZOOM_STORAGE_KEY,
  ZOOM_REASSERT_WINDOW_EVENTS,
  clampZoomLevel,
  installZoomReassertOnWindowEvents,
  percentToZoomLevel,
  zoomLevelToPercent
}
