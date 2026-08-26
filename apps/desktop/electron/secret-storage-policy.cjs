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

function storedConnectionSecretSlots(config) {
  const slots = []
  if (config?.remote?.token && typeof config.remote.token === 'object') {
    slots.push(config.remote)
  }
  for (const profile of Object.values(config?.profiles || {})) {
    if (profile?.token && typeof profile.token === 'object') slots.push(profile)
  }
  return slots
}

function detachedConnectionConfig(config) {
  const source = config && typeof config === 'object' ? config : {}
  const copy = { ...source }

  if (source.remote && typeof source.remote === 'object') {
    copy.remote = { ...source.remote }
  }
  if (source.profiles && typeof source.profiles === 'object') {
    copy.profiles = Object.fromEntries(
      Object.entries(source.profiles).map(([name, profile]) => [
        name,
        profile && typeof profile === 'object' ? { ...profile } : profile
      ])
    )
  }
  return copy
}

function rewriteStoredSecrets(config, enabled, crypto) {
  const rewritten = detachedConnectionConfig(config)

  for (const slot of storedConnectionSecretSlots(rewritten)) {
    const secret = slot.token
    const raw = String(secret?.value || '')
    if (!raw) continue

    const value = secret.encoding === 'safeStorage' ? crypto.decrypt(secret) : raw
    slot.token = enabled ? crypto.encrypt(value) : { encoding: 'plain', value }
  }
  return rewritten
}

module.exports = {
  SECRET_STORAGE_POLICY_FILE,
  classifyStoredSecret,
  readSecretStoragePolicy,
  rewriteStoredSecrets,
  storedConnectionSecretSlots,
  writeSecretStoragePolicy
}
