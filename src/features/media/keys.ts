import { randomToken } from "@/lib/ids";
import { slugify } from "@/lib/slug";
import { signToken, verifyToken } from "@/lib/signed-token";

/**
 * Storage keys and upload links (14 §2 "signed upload URLs").
 * - `incoming/<media id>/<token>`: the raw upload, private, never served;
 * - `<yyyy>/<mm>/<token>/<name>.<ext>`: the processed file, public at /media/<key>, immutable
 *   (a replacement gets a new key, so caches never serve an old file under a new name).
 */

export const PUBLIC_KEY_RE =
  /^\d{4}\/\d{2}\/[a-z0-9]{10}\/[a-z0-9][a-z0-9-]{0,79}\.(jpg|png|webp|gif|avif|svg|pdf)$/;

export function stagingKey(mediaId: string): string {
  return `incoming/${mediaId}/${randomToken(12)}`;
}

export function publicKey(fileName: string, ext: string, now = new Date()): string {
  const base = slugify(fileName.replace(/\.[a-z0-9]+$/i, ""), 60);
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${yyyy}/${mm}/${randomToken(10)}/${base === "item" ? "file" : base}.${ext}`;
}

/** File name after a format change, e.g. "IMG_1234.HEIC" -> "IMG_1234.jpg". */
export function renameExtension(fileName: string, ext: string): string {
  return `${fileName.replace(/\.[a-z0-9]+$/i, "")}.${ext}`;
}

export type UploadClaims = {
  /** media id */
  m: string;
  /** staging key */
  k: string;
  /** exact size in bytes */
  s: number;
  /** admin user who asked for the link */
  u: string;
  /** replacement of an existing file */
  r: boolean;
  /** file name (replacements keep the row until processing succeeds) */
  n: string;
  /** placeholder colour measured in the browser, if any */
  c: string | null;
};

const PURPOSE = "media-upload";
export const UPLOAD_LINK_TTL_SECONDS = 30 * 60;

export function signUpload(claims: UploadClaims): Promise<string> {
  return signToken(PURPOSE, claims, UPLOAD_LINK_TTL_SECONDS);
}

export function verifyUpload(token: string | null): Promise<UploadClaims | null> {
  return verifyToken<UploadClaims>(PURPOSE, token);
}
