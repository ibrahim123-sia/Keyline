import { isWorkersRuntime } from "@/lib/env";

/**
 * Downloads a file from an address an admin typed (photo URLs in a CSV import) without
 * letting it reach the server's own network (SSRF, 14 §2):
 * - http and https only, default ports, no user:password in the address;
 * - never loopback, private, link-local, multicast or reserved addresses, checked for the
 *   host itself and, on Node, for every address the name resolves to;
 * - redirects are followed by hand (at most `maxRedirects`) and each target checked again;
 * - a time limit, and a size limit enforced while reading.
 * On Cloudflare Workers the outgoing request cannot reach private networks at all; the
 * checks still run there. A DNS answer that changes between the check and the request
 * (rebinding) is only covered by that platform isolation.
 */

export class FetchRefused extends Error {
  constructor(
    message: string,
    /** False for problems worth retrying later (time-outs, 5xx, 429). */
    public readonly permanent = true,
  ) {
    super(message);
    this.name = "FetchRefused";
  }
}

type Lookup = (host: string) => Promise<string[]>;
type Deps = { fetch: typeof fetch; lookup: Lookup | null };

let override: Partial<Deps> | null = null;

/** Tests swap the network: a fake fetch and a fake DNS. `null` restores the real ones. */
export function setSafeFetchDeps(deps: Partial<Deps> | null): void {
  override = deps;
}

async function nodeLookup(host: string): Promise<string[]> {
  const dns = await import("node:dns/promises");
  const answers = await dns.lookup(host, { all: true, verbatim: true });
  return answers.map((a) => a.address);
}

function deps(): Deps {
  return {
    fetch: override?.fetch ?? fetch,
    lookup:
      override && "lookup" in override
        ? (override.lookup ?? null)
        : isWorkersRuntime()
          ? null
          : nodeLookup,
  };
}

/* Addresses ------------------------------------------------------------------ */

function ipv4Parts(ip: string): number[] | null {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  return parts.every((p) => p <= 255) ? parts : null;
}

function blockedV4([a, b, c]: number[]): boolean {
  return (
    a === 0 || // "this network"
    a === 10 ||
    a === 127 ||
    (a === 100 && b! >= 64 && b! <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local (cloud metadata lives here)
    (a === 172 && b! >= 16 && b! <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a! >= 224 // multicast and reserved, broadcast
  );
}

/** Expands an IPv6 address to 8 groups, or null when it is not one. */
function ipv6Groups(input: string): number[] | null {
  let ip = input.toLowerCase();
  const zone = ip.indexOf("%");
  if (zone >= 0) ip = ip.slice(0, zone);
  // A trailing dotted IPv4 (::ffff:127.0.0.1) becomes two groups.
  const v4 = ip.match(/^(.*:)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (v4) {
    const p = ipv4Parts(v4[2]!);
    if (!p) return null;
    ip = `${v4[1]}${((p[0]! << 8) | p[1]!).toString(16)}:${((p[2]! << 8) | p[3]!).toString(16)}`;
  }
  const halves = ip.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? head.length !== 8 : missing < 1) return null;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...tail];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => parseInt(g, 16));
}

/** True for addresses the server must never fetch from. Unknown formats count as blocked. */
export function isBlockedIp(ip: string): boolean {
  const v4 = ipv4Parts(ip);
  if (v4) return blockedV4(v4);
  const g = ipv6Groups(ip);
  if (!g) return true;
  const allZeroUpTo = (n: number) => g.slice(0, n).every((x) => x === 0);
  if (allZeroUpTo(7) && (g[7] === 0 || g[7] === 1)) return true; // :: and ::1
  const embedded = [g[6]! >> 8, g[6]! & 255, g[7]! >> 8, g[7]! & 255];
  if (allZeroUpTo(5) && g[5] === 0xffff) return blockedV4(embedded); // IPv4-mapped
  if (allZeroUpTo(6)) return true; // deprecated IPv4-compatible
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0))
    return blockedV4(embedded); // NAT64
  if ((g[0]! & 0xfe00) === 0xfc00) return true; // unique local fc00::/7
  if ((g[0]! & 0xffc0) === 0xfe80) return true; // link-local fe80::/10
  if ((g[0]! & 0xff00) === 0xff00) return true; // multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // documentation
  if (g[0] === 0x0100 && g.slice(1, 4).every((x) => x === 0)) return true; // discard-only
  return false;
}

const LOCAL_NAMES = /(^|\.)(localhost|local|internal|intranet|lan|home\.arpa)$/i;

/** Parses and checks an address; throws FetchRefused with a reason the admin can read. */
export async function checkUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new FetchRefused("This is not a valid web address.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new FetchRefused("Only http and https addresses can be downloaded.");
  if (url.username || url.password)
    throw new FetchRefused("Addresses with a user name or password are not allowed.");
  if (url.port && url.port !== "80" && url.port !== "443")
    throw new FetchRefused("Only the standard web ports (80 and 443) are allowed.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const literal = ipv4Parts(host) !== null || host.includes(":");
  if (literal) {
    if (isBlockedIp(host)) throw new FetchRefused("This address points to a private network.");
    return url;
  }
  if (!host.includes(".") || LOCAL_NAMES.test(host))
    throw new FetchRefused("This address points to a private network.");
  const lookup = deps().lookup;
  if (lookup) {
    let addresses: string[];
    try {
      addresses = await lookup(host);
    } catch {
      throw new FetchRefused(`The site ${host} could not be found.`);
    }
    if (addresses.length === 0) throw new FetchRefused(`The site ${host} could not be found.`);
    if (addresses.some(isBlockedIp))
      throw new FetchRefused("This address points to a private network.");
  }
  return url;
}

export type Fetched = { bytes: Uint8Array; contentType: string | null; url: string };

export async function safeFetch(
  raw: string,
  options: { maxBytes: number; timeoutMs?: number; maxRedirects?: number },
): Promise<Fetched> {
  const { fetch: doFetch } = deps();
  const maxRedirects = options.maxRedirects ?? 3;
  const signal = AbortSignal.timeout(options.timeoutMs ?? 20_000);
  let url = await checkUrl(raw);

  for (let hop = 0; ; hop++) {
    let res: Response;
    try {
      res = await doFetch(url, {
        redirect: "manual",
        signal,
        headers: { accept: "image/*", "user-agent": "LintelImport/1.0" },
      });
    } catch (err) {
      const timedOut = (err as Error).name === "TimeoutError" || signal.aborted;
      throw new FetchRefused(
        timedOut ? "The download took too long." : "The site could not be reached.",
        false,
      );
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      await res.body?.cancel();
      if (hop >= maxRedirects) throw new FetchRefused("The address redirects too many times.");
      url = await checkUrl(new URL(res.headers.get("location")!, url).toString());
      continue;
    }
    if (!res.ok) {
      await res.body?.cancel();
      const retry = res.status === 429 || res.status >= 500;
      throw new FetchRefused(`The site answered with error ${res.status}.`, !retry);
    }
    const declared = Number(res.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > options.maxBytes) {
      await res.body?.cancel();
      throw new FetchRefused("The file is larger than the upload limit (Settings -> General).");
    }
    const bytes = await readCapped(res, options.maxBytes);
    return { bytes, contentType: res.headers.get("content-type"), url: url.toString() };
  }
}

async function readCapped(res: Response, maxBytes: number): Promise<Uint8Array> {
  if (!res.body) return new Uint8Array(await res.arrayBuffer());
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    let next: ReadableStreamReadResult<Uint8Array>;
    try {
      next = await reader.read();
    } catch {
      throw new FetchRefused("The download was interrupted.", false);
    }
    if (next.done) break;
    total += next.value.length;
    if (total > maxBytes) {
      await reader.cancel();
      throw new FetchRefused("The file is larger than the upload limit (Settings -> General).");
    }
    chunks.push(next.value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}
