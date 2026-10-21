/**
 * The page builder's "Custom HTML" section (08 §1, 14 §2): an allowlist cleaner. The input is
 * split into text and tags, and the output is rebuilt from allowed tags and attributes only,
 * every value escaped again; tags left open are closed, so the HTML can never break out of its
 * section. Scripts are removed unless Settings -> Security allows them, and then they are
 * handed back separately to be run after the page loads.
 */

export type SanitizedScript = { src: string } | { code: string };
export type SanitizedHtml = { html: string; scripts: SanitizedScript[] };

const MAX_INPUT = 50_000;

/** Elements whose content is code or a form control: dropped together with their content. */
const DROP_WITH_CONTENT = new Set([
  "script",
  "style",
  "template",
  "noscript",
  "textarea",
  "title",
  "xmp",
  "noembed",
  "noframes",
  "plaintext",
  "select",
  "option",
  "object",
  "applet",
]);

const VOID = new Set(["br", "hr", "img", "wbr", "source", "track", "col"]);

const GLOBAL_ATTRS = new Set(["class", "id", "title", "lang", "dir", "role", "style", "hidden"]);

/** Allowed elements and their own attributes (plus GLOBAL_ATTRS, aria-* and data-*). */
const TAGS: Record<string, readonly string[]> = {
  a: ["href", "target", "rel", "download"],
  abbr: [],
  address: [],
  article: [],
  aside: [],
  audio: ["src", "controls", "autoplay", "muted", "loop", "preload"],
  b: [],
  bdi: [],
  blockquote: ["cite"],
  br: [],
  caption: [],
  cite: [],
  code: [],
  col: ["span"],
  colgroup: ["span"],
  dd: [],
  del: ["cite", "datetime"],
  details: ["open"],
  dfn: [],
  div: [],
  dl: [],
  dt: [],
  em: [],
  figcaption: [],
  figure: [],
  footer: [],
  h1: [],
  h2: [],
  h3: [],
  h4: [],
  h5: [],
  h6: [],
  header: [],
  hr: [],
  i: [],
  iframe: ["src", "width", "height", "allow", "allowfullscreen", "loading", "title"],
  img: ["src", "srcset", "sizes", "alt", "width", "height", "loading", "decoding"],
  ins: ["cite", "datetime"],
  kbd: [],
  li: ["value"],
  mark: [],
  ol: ["start", "reversed", "type"],
  p: [],
  picture: [],
  pre: [],
  q: ["cite"],
  s: [],
  samp: [],
  section: [],
  small: [],
  source: ["src", "srcset", "type", "media", "sizes"],
  span: [],
  strong: [],
  sub: [],
  summary: [],
  sup: [],
  table: [],
  tbody: [],
  td: ["colspan", "rowspan", "headers"],
  tfoot: [],
  th: ["colspan", "rowspan", "headers", "scope"],
  thead: [],
  time: ["datetime"],
  tr: [],
  track: ["src", "kind", "srclang", "label", "default"],
  u: [],
  ul: [],
  video: [
    "src",
    "poster",
    "controls",
    "autoplay",
    "muted",
    "loop",
    "playsinline",
    "preload",
    "width",
    "height",
  ],
};

const URL_ATTRS = new Set(["href", "src", "poster", "cite"]);
const SAFE_SCHEMES = new Set(["http", "https", "mailto", "tel"]);

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: String.fromCharCode(160),
  colon: ":",
  sol: "/",
  lpar: "(",
  rpar: ")",
  comma: ",",
  period: ".",
  equals: "=",
  Tab: String.fromCharCode(9),
  NewLine: String.fromCharCode(10),
};

/** Decodes character references in an attribute value (what the browser would read). */
export function decodeEntities(value: string): string {
  return value.replace(/&(#[xX][0-9a-fA-F]{1,6}|#[0-9]{1,7}|[A-Za-z]{2,10});?/g, (all, ref) => {
    const r = String(ref);
    if (r[0] === "#") {
      const code =
        r[1] === "x" || r[1] === "X" ? parseInt(r.slice(2), 16) : parseInt(r.slice(1), 10);
      if (
        !Number.isFinite(code) ||
        code <= 0 ||
        code > 0x10ffff ||
        (code >= 0xd800 && code <= 0xdfff)
      )
        return String.fromCharCode(0xfffd);
      return String.fromCodePoint(code);
    }
    return Object.hasOwn(NAMED, r) ? NAMED[r]! : all;
  });
}

/** Without whitespace and control characters (browsers ignore them inside a URL scheme). */
function squash(value: string): string {
  let out = "";
  for (const ch of value) {
    const c = ch.charCodeAt(0);
    if (c > 0x20 && !(c >= 0x7f && c <= 0x9f)) out += ch;
  }
  return out.toLowerCase();
}

/** The link when it is safe to follow: http(s), mailto, tel, or a path on this site. */
export function safeUrl(value: string, { httpsOnly = false } = {}): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const probe = squash(trimmed);
  const scheme = /^([a-z][a-z0-9+.-]*):/.exec(probe)?.[1];
  if (httpsOnly) return scheme === "https" ? trimmed : null;
  if (scheme) return SAFE_SCHEMES.has(scheme) ? trimmed : null;
  return trimmed;
}

const escapeText = (s: string) =>
  s
    .replace(/&(?!(#[xX][0-9a-fA-F]{1,6}|#[0-9]{1,7}|[A-Za-z][A-Za-z0-9]{1,31});)/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const escapeAttr = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

type Attr = { name: string; value: string };
type OpenTag = { name: string; attrs: Attr[]; selfClosing: boolean; end: number };

const TAG_NAME = /[A-Za-z][A-Za-z0-9-]*/y;
const ATTR = /[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?/y;
const SPACE = /\s+/y;

function parseOpenTag(input: string, lt: number): OpenTag | null {
  TAG_NAME.lastIndex = lt + 1;
  const name = TAG_NAME.exec(input);
  if (!name) return null;
  let j = TAG_NAME.lastIndex;
  const attrs: Attr[] = [];
  while (j < input.length) {
    SPACE.lastIndex = j;
    if (SPACE.exec(input)) j = SPACE.lastIndex;
    const ch = input[j];
    if (ch === ">") return { name: name[0].toLowerCase(), attrs, selfClosing: false, end: j + 1 };
    if (ch === "/") {
      if (input[j + 1] === ">")
        return { name: name[0].toLowerCase(), attrs, selfClosing: true, end: j + 2 };
      j++;
      continue;
    }
    ATTR.lastIndex = j;
    const m = ATTR.exec(input);
    if (!m) return null;
    const raw = m[0];
    const eq = raw.indexOf("=");
    const attrName = (eq === -1 ? raw : raw.slice(0, eq)).trim().toLowerCase();
    let value = eq === -1 ? "" : raw.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    )
      value = value.slice(1, -1);
    attrs.push({ name: attrName, value });
    j = ATTR.lastIndex;
  }
  return null;
}

/** Where `</name` starts after `from` (case-insensitive), or -1. */
function closingTag(input: string, from: number, name: string): number {
  const re = new RegExp(`</${name}[\\s>/]`, "gi");
  re.lastIndex = from;
  const m = re.exec(input);
  return m ? m.index : -1;
}

const BAD_STYLE = /expression|javascript:|vbscript:|@import|behavior|-moz-binding|url\s*\(/i;

function cleanAttrs(tag: string, attrs: Attr[]): string {
  const own = Object.hasOwn(TAGS, tag) ? TAGS[tag]! : [];
  const out: Attr[] = [];
  let blank = false;
  for (const a of attrs) {
    const name = a.name;
    if (name.startsWith("on")) continue;
    const allowed =
      GLOBAL_ATTRS.has(name) ||
      own.includes(name) ||
      /^aria-[a-z-]+$/.test(name) ||
      /^data-[a-z0-9-]+$/.test(name);
    if (!allowed || out.some((x) => x.name === name)) continue;
    let value = decodeEntities(a.value);
    if (URL_ATTRS.has(name)) {
      const safe = safeUrl(value, { httpsOnly: tag === "iframe" && name === "src" });
      if (safe === null) continue;
      value = safe;
    } else if (name === "srcset") {
      const parts = value.split(",").map((p) => p.trim());
      if (parts.some((p) => safeUrl(p.split(/\s+/)[0] ?? "") === null)) continue;
    } else if (name === "style") {
      if (BAD_STYLE.test(squash(value))) continue;
    } else if (name === "target") {
      if (!["_blank", "_self", "_parent", "_top"].includes(value)) continue;
      blank = value === "_blank";
    } else if (name === "rel") {
      continue; // set below
    }
    out.push({ name, value });
  }
  if (tag === "a" && blank) out.push({ name: "rel", value: "noopener noreferrer" });
  if (tag === "iframe") {
    out.push({
      name: "sandbox",
      value: "allow-scripts allow-same-origin allow-popups allow-forms allow-presentation",
    });
    if (!out.some((a) => a.name === "loading")) out.push({ name: "loading", value: "lazy" });
    out.push({ name: "referrerpolicy", value: "strict-origin-when-cross-origin" });
  }
  return out.map((a) => ` ${a.name}="${escapeAttr(a.value)}"`).join("");
}

export function sanitizeHtml(input: string, opts: { allowScripts?: boolean } = {}): SanitizedHtml {
  const src = input.slice(0, MAX_INPUT);
  const out: string[] = [];
  const stack: string[] = [];
  const scripts: SanitizedScript[] = [];
  let i = 0;
  while (i < src.length) {
    const lt = src.indexOf("<", i);
    if (lt === -1) {
      out.push(escapeText(src.slice(i)));
      break;
    }
    if (lt > i) out.push(escapeText(src.slice(i, lt)));
    if (src.startsWith("<!--", lt)) {
      const end = src.indexOf("-->", lt + 4);
      i = end === -1 ? src.length : end + 3;
      continue;
    }
    if (src[lt + 1] === "!" || src[lt + 1] === "?") {
      const end = src.indexOf(">", lt);
      i = end === -1 ? src.length : end + 1;
      continue;
    }
    if (src[lt + 1] === "/") {
      TAG_NAME.lastIndex = lt + 2;
      const name = TAG_NAME.exec(src);
      const end = src.indexOf(">", lt);
      if (!name || end === -1) {
        out.push("&lt;");
        i = lt + 1;
        continue;
      }
      i = end + 1;
      const tag = name[0].toLowerCase();
      if (stack.includes(tag)) {
        while (stack.length) {
          const top = stack.pop()!;
          out.push(`</${top}>`);
          if (top === tag) break;
        }
      }
      continue;
    }
    const open = parseOpenTag(src, lt);
    if (!open) {
      out.push("&lt;");
      i = lt + 1;
      continue;
    }
    i = open.end;
    const tag = open.name;
    if (DROP_WITH_CONTENT.has(tag) || tag === "iframe") {
      const close = open.selfClosing ? -1 : closingTag(src, i, tag);
      const content = close === -1 ? "" : src.slice(i, close);
      if (close !== -1) {
        const end = src.indexOf(">", close);
        i = end === -1 ? src.length : end + 1;
      }
      if (tag === "iframe") {
        out.push(`<iframe${cleanAttrs("iframe", open.attrs)}></iframe>`);
      } else if (tag === "script" && opts.allowScripts) {
        const srcAttr = open.attrs.find((a) => a.name === "src");
        const url = srcAttr ? safeUrl(decodeEntities(srcAttr.value), { httpsOnly: true }) : null;
        if (srcAttr && url) scripts.push({ src: url });
        else if (!srcAttr && content.trim()) scripts.push({ code: content });
      } else if (tag === "style" && opts.allowScripts && content.trim()) {
        out.push(`<style>${content.replace(/<\/?style/gi, "")}</style>`);
      }
      continue;
    }
    if (!Object.hasOwn(TAGS, tag)) continue;
    out.push(`<${tag}${cleanAttrs(tag, open.attrs)}>`);
    if (!VOID.has(tag) && !open.selfClosing) stack.push(tag);
  }
  while (stack.length) out.push(`</${stack.pop()}>`);
  return { html: out.join(""), scripts };
}
