/**
 * Environment variables renamed with the product (Keyline -> Propel, 2026-10-27). The new
 * name wins; a deployment still setting the old one keeps working until it is updated.
 * Remove the fallback once every environment uses the PROPEL_* names.
 */
export const legacyEnvNames = {
  PROPEL_ENV: "KEYLINE_ENV",
  PROPEL_RELEASE: "KEYLINE_RELEASE",
  PROPEL_DATA_DIR: "KEYLINE_DATA_DIR",
} as const;

export type RenamedEnv = keyof typeof legacyEnvNames;

export function readEnv(
  name: RenamedEnv,
  source: Record<string, string | undefined> = process.env,
): string | undefined {
  return source[name] || source[legacyEnvNames[name]] || undefined;
}
