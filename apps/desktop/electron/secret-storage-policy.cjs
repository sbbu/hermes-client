const SECRET_STORAGE_POLICY_FILE = 'secure-token-storage.json'

function readSecretStoragePolicy(io) {
  try {
    const parsed = JSON.parse(io.readText())
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { on: parsed.on === true, migrated: parsed.migrated === true }
    }
  } catch {
    // Missing, unreadable, or malformed settings use the safe no-keychain default.
  }
  return { on: false, migrated: false }
}

function writeSecretStoragePolicy(policy, io) {
  io.writeText(JSON.stringify({ on: policy.on === true, migrated: policy.migrated === true }))
}

function classifyStoredSecret(secret, policy) {
  if (!secret || typeof secret !== 'object' || secret.encoding !== 'safeStorage') return 'keep'
  if (policy.on) return 'keep'
  return policy.migrated ? 'drop' : 'migrate'
}

module.exports = {
  SECRET_STORAGE_POLICY_FILE,
  classifyStoredSecret,
  readSecretStoragePolicy,
  writeSecretStoragePolicy
}
