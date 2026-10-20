/**
 * Request metadata for audit entries and rate limits. IPs are truncated before storage
 * (IPv4 /24, IPv6 /48) so no full address is ever kept (14-non-functional.md §3).
 */

export type RequestMeta = { ip: string | null; userAgent: string | null; country: string | null };

export function truncateIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const value = ip.trim();
  if (value.includes(".") && !value.includes(":")) {
    const parts = value.split(".");
    if (parts.length !== 4) return null;
    return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
  }
  if (value.includes(":")) {
    const v4mapped = value.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
    if (v4mapped) return truncateIp(v4mapped[1]);
    const head = value.split("::")[0]!.split(":").filter(Boolean).slice(0, 3);
    while (head.length < 3) head.push("0");
    return `${head.join(":")}::`;
  }
  return null;
}

/** Client IP as Cloudflare (or a local proxy) reports it. Not truncated: callers decide. */
export function clientIpFromHeaders(h: Headers): string | null {
  const cf = h.get("cf-connecting-ip");
  if (cf) return cf;
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return h.get("x-real-ip");
}

export function requestMetaFromHeaders(h: Headers): RequestMeta {
  return {
    ip: truncateIp(clientIpFromHeaders(h)),
    userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
    country: h.get("cf-ipcountry"),
  };
}

/** Reads the current request's headers when called inside a request; null values otherwise (jobs). */
export async function currentRequestMeta(): Promise<RequestMeta> {
  try {
    const { headers } = await import("next/headers");
    return requestMetaFromHeaders(await headers());
  } catch {
    return { ip: null, userAgent: null, country: null };
  }
}
