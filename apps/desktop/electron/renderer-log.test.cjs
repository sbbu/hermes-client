'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const {
  attachRendererConsoleCapture,
  formatRendererBoundaryReport,
  formatRendererConsoleLine
} = require('./renderer-log.cjs')

test('console formatter supports current and legacy Electron signatures', () => {
  assert.equal(
    formatRendererConsoleLine('main', { level: 3, message: 'boom', sourceUrl: 'app.js', lineNumber: 7 }),
    '[renderer console:main] boom (app.js:7)'
  )
  assert.equal(
    formatRendererConsoleLine('secondary', 3, 'bad', 9, 'chunk.js'),
    '[renderer console:secondary] bad (chunk.js:9)'
  )
  assert.equal(formatRendererConsoleLine('main', { level: 1, message: 'noise' }), null)
})

test('console capture labels error lines and ignores non-errors', () => {
  let listener
  const lines = []
  attachRendererConsoleCapture({ webContents: { on: (_event, fn) => (listener = fn) } }, 'pet-overlay', line =>
    lines.push(line)
  )
  listener({}, { level: 0, message: 'debug' })
  listener({}, { level: 3, message: 'crash', sourceUrl: 'overlay.js', lineNumber: 2 })
  assert.deepEqual(lines, ['[renderer console:pet-overlay] crash (overlay.js:2)'])
})

test('boundary reports are labeled and renderer input is bounded', () => {
  const report = formatRendererBoundaryReport('main', 'root', 'boom', 'component stack')
  assert.equal(report, '[renderer crash:main] [error-boundary:root] boom\ncomponent stack')
  assert.ok(formatRendererBoundaryReport('x'.repeat(100), '', 'm'.repeat(3000), 's'.repeat(5000)).length < 6200)
})

test('boundary IPC derives labels from owned top-level renderer senders', () => {
  const main = fs.readFileSync(path.join(__dirname, 'main.cjs'), 'utf8')
  assert.match(main, /rendererLogSenders\.set\(win\.webContents, label\)/)
  assert.match(main, /const label = rendererLogSenders\.get\(event\.sender\)/)
  assert.match(main, /senderFrame !== senderFrame\.top/)
  assert.doesNotMatch(main, /const \{ label, boundary, message, componentStack \} = report/)
})
