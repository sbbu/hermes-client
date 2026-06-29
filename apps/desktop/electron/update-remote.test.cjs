/**
 * Tests for electron/update-remote.cjs — the remote-detection helpers that
 * keep passive update checks off the SSH origin for client installs.
 *
 * Run with: node --test electron/update-remote.test.cjs
 * (Wired into npm test:desktop:platforms in package.json.)
 *
 * Why this matters: a public install can carry
 * origin=git@github.com:sbbu/hermes-client.git. A background
 * `git fetch origin` then authenticates over SSH and, with a FIDO2/passkey
 * key, triggers an unexplained hardware-touch prompt. isOfficialSshRemote
 * must reliably recognize the client SSH remote (in every URL form,
 * case-insensitively) so the caller can swap in the anonymous HTTPS path —
 * while NOT misclassifying forks, other hosts, or the HTTPS remote (which
 * never prompts and should keep the normal fetch path).
 */

const test = require('node:test')
const assert = require('node:assert/strict')

const {
  OFFICIAL_REPO_HTTPS_URL,
  OFFICIAL_REPO_CANONICAL,
  canonicalGitHubRemote,
  isSshRemote,
  isOfficialSshRemote
} = require('./update-remote.cjs')

test('canonicalGitHubRemote normalizes SSH and HTTPS forms to the same value', () => {
  assert.equal(canonicalGitHubRemote('git@github.com:sbbu/hermes-client.git'), OFFICIAL_REPO_CANONICAL)
  assert.equal(canonicalGitHubRemote('git@github.com:sbbu/hermes-client'), OFFICIAL_REPO_CANONICAL)
  assert.equal(canonicalGitHubRemote('ssh://git@github.com/sbbu/hermes-client.git'), OFFICIAL_REPO_CANONICAL)
  assert.equal(canonicalGitHubRemote('https://github.com/sbbu/hermes-client.git'), OFFICIAL_REPO_CANONICAL)
  // Case-insensitive: an uppercased owner still canonicalizes to the same repo.
  assert.equal(canonicalGitHubRemote('git@github.com:SBBU/hermes-client.git'), OFFICIAL_REPO_CANONICAL)
  // Trailing slashes are stripped.
  assert.equal(canonicalGitHubRemote('https://github.com/sbbu/hermes-client/'), OFFICIAL_REPO_CANONICAL)
})

test('canonicalGitHubRemote is empty for falsy input', () => {
  assert.equal(canonicalGitHubRemote(''), '')
  assert.equal(canonicalGitHubRemote(null), '')
  assert.equal(canonicalGitHubRemote(undefined), '')
})

test('isSshRemote detects scp-like and ssh:// forms only', () => {
  assert.equal(isSshRemote('git@github.com:sbbu/hermes-client.git'), true)
  assert.equal(isSshRemote('ssh://git@github.com/sbbu/hermes-client.git'), true)
  assert.equal(isSshRemote('https://github.com/sbbu/hermes-client.git'), false)
  assert.equal(isSshRemote(''), false)
  assert.equal(isSshRemote(null), false)
})

test('isOfficialSshRemote is true only for the client repo over SSH', () => {
  assert.equal(isOfficialSshRemote('git@github.com:sbbu/hermes-client.git'), true)
  assert.equal(isOfficialSshRemote('git@github.com:sbbu/hermes-client'), true)
  assert.equal(isOfficialSshRemote('ssh://git@github.com/sbbu/hermes-client.git'), true)
  // Case-insensitive owner/repo match.
  assert.equal(isOfficialSshRemote('git@github.com:SBBU/hermes-client.git'), true)
})

test('isOfficialSshRemote does NOT match forks, other hosts, or HTTPS', () => {
  // A fork over SSH belongs to the user — fetching it is their own remote,
  // not the client upstream, so the SSH-avoidance swap must not apply.
  assert.equal(isOfficialSshRemote('git@github.com:someuser/hermes-client.git'), false)
  // Same repo name on a different host is not the client repo.
  assert.equal(isOfficialSshRemote('git@gitlab.com:sbbu/hermes-client.git'), false)
  // HTTPS to the client repo never prompts for SSH/FIDO2, so it keeps the
  // normal fetch path — must not be flagged as an client SSH remote.
  assert.equal(isOfficialSshRemote('https://github.com/sbbu/hermes-client.git'), false)
  assert.equal(isOfficialSshRemote(''), false)
  assert.equal(isOfficialSshRemote(null), false)
})

test('OFFICIAL_REPO_HTTPS_URL canonicalizes to OFFICIAL_REPO_CANONICAL', () => {
  // Invariant: the URL we substitute in must be the same repo we detect.
  assert.equal(canonicalGitHubRemote(OFFICIAL_REPO_HTTPS_URL), OFFICIAL_REPO_CANONICAL)
})
