const assert = require('node:assert/strict')
const test = require('node:test')

const {
  SECRET_STORAGE_POLICY_FILE,
  classifyStoredSecret,
  readSecretStoragePolicy,
  rewriteStoredSecrets,
  writeSecretStoragePolicy
} = require('./secret-storage-policy.cjs')

const secret = { encoding: 'safeStorage', value: 'abc' }

test('policy defaults to keychain off and migration pending', () => {
  assert.equal(SECRET_STORAGE_POLICY_FILE, 'secure-token-storage.json')
  assert.deepEqual(
    readSecretStoragePolicy({
      readText: () => {
        throw new Error('missing')
      }
    }),
    {
      on: false,
      migrated: false
    }
  )
  assert.deepEqual(readSecretStoragePolicy({ readText: () => '{"on":"yes","migrated":1}' }), {
    on: false,
    migrated: false
  })
})

test('policy writes strict booleans', () => {
  let text = ''
  writeSecretStoragePolicy(
    { on: 1, migrated: true },
    {
      writeText: value => {
        text = value
      }
    }
  )
  assert.deepEqual(JSON.parse(text), { on: false, migrated: true })
})

test('safeStorage blobs migrate once while encryption is off', () => {
  assert.equal(classifyStoredSecret(secret, { on: false, migrated: false }), 'migrate')
  assert.equal(classifyStoredSecret(secret, { on: false, migrated: true }), 'drop')
  assert.equal(classifyStoredSecret(secret, { on: true, migrated: true }), 'keep')
  assert.equal(classifyStoredSecret({ encoding: 'plain', value: 'abc' }, { on: false, migrated: true }), 'keep')
})

test('secret rewrites leave the cached connection config untouched until persistence succeeds', () => {
  const cached = {
    mode: 'remote',
    remote: { token: { encoding: 'plain', value: 'global-token' } },
    profiles: {
      coder: { mode: 'remote', token: { encoding: 'plain', value: 'profile-token' } }
    }
  }

  const rewritten = rewriteStoredSecrets(cached, true, {
    decrypt: stored => `decrypted:${stored.value}`,
    encrypt: value => ({ encoding: 'safeStorage', value: `encrypted:${value}` })
  })

  assert.deepEqual(cached, {
    mode: 'remote',
    remote: { token: { encoding: 'plain', value: 'global-token' } },
    profiles: {
      coder: { mode: 'remote', token: { encoding: 'plain', value: 'profile-token' } }
    }
  })
  assert.deepEqual(rewritten.remote.token, { encoding: 'safeStorage', value: 'encrypted:global-token' })
  assert.deepEqual(rewritten.profiles.coder.token, {
    encoding: 'safeStorage',
    value: 'encrypted:profile-token'
  })
})
