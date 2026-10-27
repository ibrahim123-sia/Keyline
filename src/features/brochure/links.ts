import "server-only";
import { signToken, verifyToken } from "@/lib/signed-token";
import { brochurePath } from "./paths";
import type { BrochureKind } from "./types";

export { adminBrochurePath, brochurePath } from "./paths";

const PURPOSE = "brochure-download";
/** The emailed link keeps working for a month. */
const TTL_SECONDS = 30 * 24 * 3600;

/** A download link that passes the email gate, for this one brochure. */
export async function signedBrochurePath(kind: BrochureKind, id: string): Promise<string> {
  const token = await signToken(PURPOSE, { k: kind, i: id }, TTL_SECONDS);
  return `${brochurePath(kind, id)}?t=${encodeURIComponent(token)}`;
}

export async function brochureTokenValid(
  token: string | null,
  kind: BrochureKind,
  id: string,
): Promise<boolean> {
  const claims = await verifyToken<{ k: string; i: string }>(PURPOSE, token);
  return claims?.k === kind && claims.i === id;
}
