export const RECORDS_KEY = 'holdings-records-v1'
export const SETTINGS_KEY = 'holdings-settings-v1'

// Keys used before the project was renamed from Founder OS, newest first.
const LEGACY_KEYS = {
  [RECORDS_KEY]: ['founder-os-records-v2', 'founder-os-records-v1'],
  [SETTINGS_KEY]: ['founder-os-settings-v1'],
}

// Copy data saved under an old key to the current key, once. The old key is
// left in place so going back to an older version still works.
export function migrateLegacyStorage(storage) {
  Object.entries(LEGACY_KEYS).forEach(([key, legacyKeys]) => {
    if (storage.getItem(key) !== null) return
    const legacyKey = legacyKeys.find((candidate) => storage.getItem(candidate) !== null)
    if (legacyKey) storage.setItem(key, storage.getItem(legacyKey))
  })
}

export const DEMO_VERSION_KEY = 'holdings-demo-version'

/**
 * In the demo, made-up data saved by an older version is replaced, so a
 * returning visitor sees what is new. Returns true when it should be.
 */
export function isDemoDataStale(storage, version) {
  const saved = storage.getItem(DEMO_VERSION_KEY)
  storage.setItem(DEMO_VERSION_KEY, version)
  return saved !== version
}
