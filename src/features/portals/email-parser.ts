/**
 * Portal lead emails (13 §1 "Portals"): agencies forward the emails portals send for each
 * enquiry to their portal inbox address; this reads name, email, phone, listing reference and
 * message out of them. Two common layouts plus a generic fallback. Pure.
 */
export type PortalLead = {
  name: string | null;
  email: string | null;
  phone: string | null;
  reference: string | null;
  message: string | null;
};

type Field = keyof PortalLead;

const labels: Record<Field, string[]> = {
  name: [
    "name",
    "full name",
    "customer name",
    "client name",
    "contact name",
    "lead name",
    "enquirer",
  ],
  email: ["email", "e-mail", "email address", "e-mail address"],
  phone: [
    "phone",
    "phone number",
    "mobile",
    "mobile number",
    "telephone",
    "tel",
    "contact number",
    "whatsapp",
  ],
  reference: [
    "reference",
    "ref",
    "ref no",
    "ref number",
    "reference number",
    "listing reference",
    "property reference",
    "listing ref",
    "property ref",
    "listing id",
    "property id",
    "agent reference",
  ],
  message: ["message", "comments", "comment", "enquiry", "inquiry", "notes", "question"],
};

const byLabel = new Map<string, Field>();
for (const [field, names] of Object.entries(labels) as Array<[Field, string[]]>)
  for (const n of names) byLabel.set(n, field);

const normLabel = (s: string) =>
  s
    .toLowerCase()
    .replace(/[*_#:.\-–]+$/g, "")
    .replace(/^[*_#\s]+/g, "")
    .replace(/\s+/g, " ")
    .trim();

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE = /(?:\+|00)?\d[\d\s().-]{6,}\d/;

/** Plain text from an HTML email: line breaks kept, tags dropped, common entities decoded. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|table)>/gi, "\n")
    .replace(/<\/t[dh]>/gi, "\t")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** The new part of a reply: quoted history ("On … wrote:", "> …", "From: …") cut off. */
export function stripQuotedReply(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    const l = line.trim();
    if (/^on .+wrote:$/i.test(l) || /^-{2,}\s*original message\s*-{2,}$/i.test(l)) break;
    if (/^from:\s.+/i.test(l) && out.length > 0) break;
    if (l.startsWith(">")) continue;
    out.push(line);
  }
  const reply = out.join("\n").trim();
  return reply || text.trim();
}

function clean(field: Field, value: string): string | null {
  const v = value.replace(/\s+/g, " ").trim();
  if (!v) return null;
  if (field === "email") return EMAIL.exec(v)?.[0].toLowerCase() ?? null;
  if (field === "phone") return PHONE.exec(v)?.[0].replace(/[\s().-]/g, "") ?? null;
  if (field === "reference") return v.split(/\s/)[0]!.replace(/[^\w/-]/g, "") || null;
  return v.slice(0, field === "message" ? 2000 : 120);
}

/** "Name: Sam" lines; a message runs on until the next label. */
function labelled(lines: string[]): Partial<PortalLead> {
  const found: Partial<PortalLead> = {};
  let current: Field | null = null;
  const message: string[] = [];
  for (const line of lines) {
    const m = /^\s*([A-Za-z][A-Za-z .\-/]{0,30}?)\s*[:\-–]\s+(.*)$/.exec(line);
    const field = m ? byLabel.get(normLabel(m[1]!)) : undefined;
    if (m && field) {
      current = field;
      if (field === "message") message.push(m[2]!);
      else if (!found[field]) found[field] = clean(field, m[2]!);
      continue;
    }
    if (current === "message" && line.trim()) message.push(line.trim());
    else if (line.trim() && current !== "message") current = null;
  }
  if (message.length) found.message = clean("message", message.join(" "));
  return found;
}

/** Label on one line, value on the next (HTML tables turned into text). */
function stacked(lines: string[]): Partial<PortalLead> {
  const found: Partial<PortalLead> = {};
  const nonEmpty = lines.map((l) => l.trim()).filter(Boolean);
  for (let i = 0; i < nonEmpty.length - 1; i++) {
    const cells = nonEmpty[i]!.split("\t")
      .map((c) => c.trim())
      .filter(Boolean);
    // "Label<TAB>value" on one line (a two-column table row).
    if (cells.length === 2) {
      const field = byLabel.get(normLabel(cells[0]!));
      if (field && !found[field]) found[field] = clean(field, cells[1]!);
      continue;
    }
    const field = byLabel.get(normLabel(nonEmpty[i]!));
    if (field && !found[field] && !byLabel.has(normLabel(nonEmpty[i + 1]!))) {
      found[field] = clean(field, nonEmpty[i + 1]!);
      i++;
    }
  }
  return found;
}

export function parsePortalEmail(input: {
  subject: string;
  text: string;
  /** Listing references look like PREFIX-1001 (Settings -> General). */
  referencePrefix?: string | null;
}): PortalLead & { layout: "labelled" | "stacked" | "generic" } {
  const lines = input.text.replace(/\r\n/g, "\n").split("\n");
  const a = labelled(lines);
  const b = stacked(lines);
  const layout =
    Object.keys(a).length >= Object.keys(b).length && Object.keys(a).length > 0
      ? "labelled"
      : Object.keys(b).length > 0
        ? "stacked"
        : "generic";
  const pickFirst = (f: Field) => (layout === "stacked" ? (b[f] ?? a[f]) : (a[f] ?? b[f])) ?? null;
  const lead: PortalLead = {
    name: pickFirst("name"),
    email: pickFirst("email"),
    phone: pickFirst("phone"),
    reference: pickFirst("reference"),
    message: pickFirst("message"),
  };
  // Generic fallback: anything that looks like an email, phone or reference.
  const all = `${input.subject}\n${input.text}`;
  lead.email ??= EMAIL.exec(input.text)?.[0].toLowerCase() ?? null;
  lead.phone ??= PHONE.exec(input.text)?.[0].replace(/[\s().-]/g, "") ?? null;
  if (!lead.reference) {
    const prefix = input.referencePrefix?.trim();
    const re = prefix
      ? new RegExp(`\\b${prefix.replace(/[^A-Za-z0-9]/g, "")}-\\d{2,8}\\b`, "i")
      : /\b[A-Z]{2,6}-\d{2,8}\b/;
    lead.reference = re.exec(all)?.[0].toUpperCase() ?? null;
  }
  return { ...lead, layout };
}
