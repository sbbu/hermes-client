'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const {
  describeRendererLifecycleEvent,
  installWindowRendererLifecycle,
  pruneReloadTimes,
  shouldReloadAfterFailedLoad,
  shouldReloadAfterRendererGone
} = require('./window-renderer-lifecycle.cjs')

function fakeWindow() {
  const listeners = new Map()
  return {
    destroyed: false,
    isDestroyed() {
      return this.destroyed
    },
    webContents: {
      on(event, listener) {
        listeners.set(event, listener)
      },
      removeListener(event, listener) {
        if (listeners.get(event) === listener) listeners.delete(event)
      }
    },
    emit(event, ...args) {
      listeners.get(event)?.({}, ...args)
    },
    listeners
  }
}

test('reload policy accepts only live crashed or oom renderers', () => {
  const common = { recentReloadTimes: [], now: () => 100 }
  assert.equal(shouldReloadAfterRendererGone({ ...common, reason: 'crashed' }).reload, true)
  assert.equal(shouldReloadAfterRendererGone({ ...common, reason: 'oom' }).reload, true)
  assert.equal(shouldReloadAfterRendererGone({ ...common, reason: 'killed' }).reload, false)
  assert.equal(shouldReloadAfterRendererGone({ ...common, reason: 'crashed', isDestroyed: true }).reload, false)
})

test('reload policy enforces and prunes the rolling crash budget', () => {
  assert.equal(
    shouldReloadAfterRendererGone({ reason: 'crashed', recentReloadTimes: [10, 20, 30], reloadMax: 3, now: () => 40 })
      .suppressedReason,
    'crash-loop'
  )
  assert.deepEqual(pruneReloadTimes([0, 50, 99], 100, 60), [50, 99])
})

test('lifecycle logs and defers a recoverable reload', async () => {
  const win = fakeWindow()
  const logs = []
  let reloads = 0
  installWindowRendererLifecycle(win, {
    kind: 'secondary',
    callbacks: { log: line => logs.push(line), reload: () => reloads++ },
    now: () => 10
  })
  win.emit('render-process-gone', { reason: 'crashed', exitCode: 3 })
  assert.equal(reloads, 0)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(reloads, 1)
  assert.match(logs[0], /renderer:secondary.*reason=crashed.*exitCode=3/)
})

test('shared budget suppresses cross-window crash loops', async () => {
  const budget = { current: [] }
  const logs = []
  for (let index = 0; index < 4; index++) {
    const win = fakeWindow()
    installWindowRendererLifecycle(win, {
      kind: `window-${index}`,
      callbacks: { log: line => logs.push(line), reload: () => {} },
      recentReloadTimesRef: budget,
      now: () => index
    })
    win.emit('render-process-gone', { reason: 'crashed' })
  }
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(budget.current.length, 3)
  assert.match(logs.at(-1), /suppressing reload/)
})

test('teardown and helper-window crashes are log-only', async () => {
  const win = fakeWindow()
  const logs = []
  let reloads = 0
  installWindowRendererLifecycle(win, { kind: 'overlay', callbacks: { log: line => logs.push(line) } })
  win.emit('render-process-gone', { reason: 'crashed' })
  win.destroyed = true
  win.emit('render-process-gone', { reason: 'killed' })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(reloads, 0)
  assert.match(logs.at(-1), /expected teardown/)
})

test('main-frame load failures and unresponsive events are labeled', () => {
  const win = fakeWindow()
  const logs = []
  const dispose = installWindowRendererLifecycle(win, { kind: 'main', callbacks: { log: line => logs.push(line) } })
  win.emit('did-fail-load', -105, 'ERR_NAME_NOT_RESOLVED', 'https://example.invalid', false)
  win.emit('did-fail-load', -105, 'ERR_NAME_NOT_RESOLVED', 'https://example.invalid', true)
  win.emit('unresponsive')
  assert.equal(logs.length, 2)
  assert.match(logs[0], /did-fail-load code=-105/)
  assert.equal(logs[1], describeRendererLifecycleEvent({ kind: 'main', event: 'unresponsive' }))
  dispose()
  assert.equal(win.listeners.size, 0)
})

test('third-party load failures redact secret-bearing URLs', () => {
  const win = fakeWindow()
  const logs = []
  installWindowRendererLifecycle(win, {
    kind: 'oauth',
    callbacks: { log: line => logs.push(line) },
    redactLoadUrl: true
  })
  win.emit('did-fail-load', -105, 'ERR_NAME_NOT_RESOLVED', 'https://idp.example/callback?code=secret#token', true)
  assert.match(logs[0], /url=\(redacted\)$/)
  assert.doesNotMatch(logs[0], /secret|token/)
})

test('failed-load policy reloads main frames, ignores aborts, and surfaces exhaustion', () => {
  const common = { isMainFrame: true, recentReloadTimes: [], now: () => 100 }
  assert.equal(shouldReloadAfterFailedLoad({ ...common, errorCode: -6 }).reload, true)
  assert.equal(shouldReloadAfterFailedLoad({ ...common, errorCode: -3 }).reload, false)
  assert.equal(shouldReloadAfterFailedLoad({ ...common, errorCode: -6, isMainFrame: false }).reload, false)
  assert.equal(
    shouldReloadAfterFailedLoad({ ...common, errorCode: -6, recentReloadTimes: [1, 2, 3], reloadMax: 3 }).surfaceError,
    true
  )
})

test('failed-load recovery is bounded and ends on a visible-error callback', async () => {
  const win = fakeWindow()
  const budget = { current: [] }
  let reloads = 0
  let surfaced = 0
  installWindowRendererLifecycle(win, {
    kind: 'main',
    callbacks: { log: () => {}, reload: () => reloads++, onFailedLoadBudgetExhausted: () => surfaced++ },
    recentReloadTimesRef: budget,
    reloadMax: 1,
    reloadOnFailedLoad: true,
    now: () => 10
  })
  win.emit('did-fail-load', -6, 'ERR_FILE_NOT_FOUND', 'file:///missing', true)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(reloads, 1)
  win.emit('did-fail-load', -6, 'ERR_FILE_NOT_FOUND', 'file:///missing', true)
  assert.equal(surfaced, 1)
})
