'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')

const { spawnUpdaterProcess } = require('./updater-process.cjs')

test('hides and detaches the updater child on Windows', () => {
  const calls = []
  let unrefCalls = 0
  const child = {
    pid: 4242,
    unref() {
      unrefCalls += 1
    }
  }

  const result = spawnUpdaterProcess(
    'hermes-client-setup.exe',
    ['--update'],
    { cwd: 'C:\\HermesClient', detached: true, stdio: 'ignore' },
    {
      isWindows: true,
      spawnProcess(command, args, options) {
        calls.push({ args, command, options })
        return child
      }
    }
  )

  assert.equal(result, child)
  assert.equal(unrefCalls, 1)
  assert.deepEqual(calls, [
    {
      args: ['--update'],
      command: 'hermes-client-setup.exe',
      options: { cwd: 'C:\\HermesClient', detached: true, stdio: 'ignore', windowsHide: true }
    }
  ])
})

test('preserves updater options off Windows', () => {
  let capturedOptions

  spawnUpdaterProcess(
    'hermes-client-setup',
    ['--update'],
    { detached: true, stdio: 'ignore' },
    {
      isWindows: false,
      spawnProcess(_command, _args, options) {
        capturedOptions = options
        return { unref() {} }
      }
    }
  )

  assert.deepEqual(capturedOptions, { detached: true, stdio: 'ignore' })
})
