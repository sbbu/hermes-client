'use strict'

const { spawn } = require('node:child_process')

function updaterSpawnOptions(options, isWindows) {
  if (!isWindows || Object.prototype.hasOwnProperty.call(options, 'windowsHide')) {
    return options
  }

  return { ...options, windowsHide: true }
}

/** Spawn a detached updater without flashing a console window on Windows. */
function spawnUpdaterProcess(updater, updaterArgs, options, deps = {}) {
  const isWindows = deps.isWindows ?? process.platform === 'win32'
  const spawnProcess = deps.spawnProcess ?? spawn
  const child = spawnProcess(updater, updaterArgs, updaterSpawnOptions(options, isWindows))

  child.unref()

  return child
}

module.exports = { spawnUpdaterProcess, updaterSpawnOptions }
