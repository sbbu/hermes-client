const assert = require('node:assert/strict')
const test = require('node:test')

const { createWindowRevealController } = require('./window-reveal.cjs')

function createHarness({ visible = false } = {}) {
  let destroyed = false
  let isVisible = visible
  let revealCalls = 0
  let showCalls = 0
  let scheduledCallback = null
  let scheduledDelay = null
  let clearCalls = 0

  const controller = createWindowRevealController(
    {
      isDestroyed: () => destroyed,
      isVisible: () => isVisible,
      show: () => {
        showCalls += 1
        isVisible = true
      }
    },
    {
      onRevealed: () => {
        revealCalls += 1
      },
      setTimer: (callback, delay) => {
        scheduledCallback = callback
        scheduledDelay = delay
        return 1
      },
      clearTimer: () => {
        clearCalls += 1
      }
    }
  )

  return {
    controller,
    destroy: () => {
      destroyed = true
    },
    get clearCalls() {
      return clearCalls
    },
    get revealCalls() {
      return revealCalls
    },
    get scheduledCallback() {
      return scheduledCallback
    },
    get scheduledDelay() {
      return scheduledDelay
    },
    get showCalls() {
      return showCalls
    }
  }
}

test('reveals immediately when ready-to-show arrives', () => {
  const harness = createHarness()
  assert.equal(harness.controller.reveal(), true)
  assert.equal(harness.showCalls, 1)
  assert.equal(harness.revealCalls, 1)
})

test('reveals through the fallback when ready-to-show is missed', () => {
  const harness = createHarness()
  harness.controller.scheduleFallback()
  assert.equal(harness.scheduledDelay, 4_000)
  harness.scheduledCallback()
  assert.equal(harness.showCalls, 1)
  assert.equal(harness.revealCalls, 1)
})

test('ready-to-show cancels the fallback and settles once', () => {
  const harness = createHarness()
  harness.controller.scheduleFallback()
  const scheduled = harness.scheduledCallback
  assert.equal(harness.controller.reveal(), true)
  assert.equal(harness.clearCalls, 1)
  scheduled()
  assert.equal(harness.showCalls, 1)
  assert.equal(harness.revealCalls, 1)
  assert.equal(harness.controller.reveal(), false)
})

test('does not reshow an already-visible window', () => {
  const harness = createHarness({ visible: true })
  assert.equal(harness.controller.reveal(), true)
  assert.equal(harness.showCalls, 0)
  assert.equal(harness.revealCalls, 1)
})

test('dispose cancels a pending fallback and prevents a late reveal', () => {
  const harness = createHarness()
  harness.controller.scheduleFallback()
  const scheduled = harness.scheduledCallback
  harness.controller.dispose()
  scheduled()
  assert.equal(harness.clearCalls, 1)
  assert.equal(harness.showCalls, 0)
})

test('does not reveal a destroyed window', () => {
  const harness = createHarness()
  harness.destroy()
  assert.equal(harness.controller.reveal(), false)
  harness.controller.scheduleFallback()
  assert.equal(harness.scheduledCallback, null)
})

test('supports a caller-specific reveal action', () => {
  const actions = []
  let scheduled = null
  const controller = createWindowRevealController(
    {
      isDestroyed: () => false,
      isVisible: () => false,
      show: () => actions.push('showInactive')
    },
    {
      onRevealed: () => actions.push('revealed'),
      setTimer: callback => {
        scheduled = callback
        return 1
      },
      clearTimer: () => {}
    }
  )

  controller.scheduleFallback()
  scheduled()
  assert.deepEqual(actions, ['showInactive', 'revealed'])
})
