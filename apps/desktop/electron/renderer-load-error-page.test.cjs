'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const { buildRendererLoadErrorPage, loadRendererLoadErrorPage } = require('./renderer-load-error-page.cjs')

test('renderer error page uses client branding and escapes inline reload URLs', () => {
  const page = buildRendererLoadErrorPage({ reloadUrl: 'file:///tmp/</script><script>boom</script>' })
  assert.match(page, /Hermes Client/)
  assert.match(page, /hermes-client update/)
  assert.doesNotMatch(page, /<script>boom/)
  assert.match(page, /\\u003c\/script\\u003e/)
})

test('loading the recovery page never rejects', async () => {
  await loadRendererLoadErrorPage({
    loadURL: async () => {
      throw new Error('closed')
    }
  })
})
