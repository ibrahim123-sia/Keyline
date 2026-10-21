const BACKSLASH = String.fromCharCode(92);
/** "<", ">", "&" and the two line separators JavaScript treats as line ends. */
const UNSAFE = new RegExp(`[<>&${String.fromCharCode(0x2028, 0x2029)}]`, "g");

/**
 * JSON for a script tag: the characters above become unicode escapes, so nothing in the data
 * can close the tag or start a comment; JSON.parse still reads the same value.
 */
export function jsonForScript(data: unknown): string {
  return JSON.stringify(data).replace(
    UNSAFE,
    (ch) => `${BACKSLASH}u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

/** Structured data (08 §6 JSON-LD) as a script tag. Pass plain objects built from our data. */
export function JsonLd({
  data,
}: {
  data: Record<string, unknown> | Array<Record<string, unknown>>;
}) {
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonForScript(data) }} />
  );
}
