const assert = require('node:assert/strict')
const test = require('node:test')

const { ensureMainWindow } = require('./main-window-lifecycle.cjs')

test('recreates a destroyed primary window', () => {
  let createCalls = 0
  let focusCalls = 0

  ensureMainWindow(
    { isDestroyed: () => true },
    {
      isReady: true,
      createWindow: () => {
        createCalls += 1
      },
      focusWindow: () => {
        focusCalls += 1
      }
    }
  )

  assert.equal(createCalls, 1)
  assert.equal(focusCalls, 0)
})

test('focuses a live primary window on a normal second launch', () => {
  const liveWindow = { isDestroyed: () => false }
  let focusedWindow = null

  ensureMainWindow(liveWindow, {
    isReady: true,
    createWindow: () => assert.fail('live window must not be replaced'),
    focusWindow: window => {
      focusedWindow = window
    }
  })

  assert.equal(focusedWindow, liveWindow)
})

test('leaves live-window focus to deep-link delivery', () => {
  const liveWindow = { isDestroyed: () => false }

  ensureMainWindow(liveWindow, {
    isReady: true,
    createWindow: () => assert.fail('live window must not be replaced'),
    focusWindow: () => assert.fail('deep-link delivery owns focus'),
    focusExisting: false
  })
})
