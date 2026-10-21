/**
 * Structured data (08 §6 JSON-LD) as a script tag. "<" is escaped so nothing in the data can
 * close the script; pass plain objects built from our own data.
 */
export function JsonLd({
  data,
}: {
  data: Record<string, unknown> | Array<Record<string, unknown>>;
}) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
