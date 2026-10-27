/**
 * Browser storage keys were renamed with the product (keyline.* -> propel.*, 2026-10-27).
 * Reads the new key; when only the old one exists, moves its value to the new key, so recent
 * homes, table columns and other remembered choices survive the rename. Client-safe.
 */
export function getStored(storage: Storage, key: string): string | null {
  const value = storage.getItem(key);
  if (value !== null || !key.startsWith("propel")) return value;
  const legacyKey = `keyline${key.slice("propel".length)}`;
  const legacy = storage.getItem(legacyKey);
  if (legacy === null) return null;
  try {
    storage.setItem(key, legacy);
    storage.removeItem(legacyKey);
  } catch {
    // Storage full or blocked: keep reading the old key.
  }
  return legacy;
}
