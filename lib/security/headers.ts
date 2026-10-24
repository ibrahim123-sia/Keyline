/**
 * Security headers (14 §2): one Content-Security-Policy for every page, plus the fixed
 * headers (HSTS, nosniff, referrer, permissions, opener isolation, framing). Edge-safe and
 * pure: the middleware builds the page policy per request, next.config.ts sets the rest.
 *
 * Why no nonces: public pages are Cache Components with a prerendered shell (Partial
 * Prerendering). Next.js only adds a nonce while it renders a request, so the prerendered
 * shell's framework scripts would carry none and be blocked (docs: "PPR is incompatible with
 * nonce-based CSP"); nonces would force every page to render per request and lose the edge
 * cache. Hashes cannot help either: the streamed React payload is inline `<script>` tags whose
 * content differs per page and per request, after the header is already sent. So scripts are
 * limited by origin ('self' + the named third parties, never 'unsafe-eval' in production), and
 * everything around them is locked down: no plugins, no <base> hijack, forms only to this
 * site, no framing by other sites, connections only to the named services. Rich text and
 * custom HTML are sanitised on save and render (decisions 43, 63), which is the XSS defence
 * this policy backs up.
 */

/** Third-party origins the app itself uses. Anything else comes from the CSP_EXTRA_* env. */
export const CSP_ORIGINS = {
  /** Cloudflare Turnstile on public forms and sign-up (script + its challenge frame). */
  turnstile: "https://challenges.cloudflare.com",
  /** Map styles, tiles, glyphs and sprites: the keyless default and the MapTiler key option. */
  maps: ["https://tiles.openfreemap.org", "https://api.maptiler.com"],
  /** Privacy-friendly video embeds (lib/video.ts) and YouTube's poster stills. */
  videoFrames: ["https://www.youtube-nocookie.com", "https://player.vimeo.com"],
  videoImages: ["https://i.ytimg.com"],
} as const;

export type CspExtras = {
  script?: string[];
  connect?: string[];
  img?: string[];
  frame?: string[];
};

export type CspOptions = {
  /** `next dev`: React needs eval for its debugging and the dev server's websocket. */
  dev: boolean;
  /** Admin portal: the in-browser HEIC converter runs WebAssembly in a worker. */
  admin?: boolean;
  /** Page builder preview (/preview/<token>): the admin editor frames it from this site. */
  frameableBySelf?: boolean;
  /** Served over https (APP_URL): ask browsers to fetch any http link over https. */
  upgradeInsecure?: boolean;
  /** Where browsers send violation reports. */
  reportUri?: string;
  extra?: CspExtras;
};

/** Origins or scheme sources only: anything with quotes, spaces or semicolons is dropped. */
function cleanSources(list: readonly string[] | undefined): string[] {
  return (list ?? []).map((s) => s.trim()).filter((s) => /^(https:\/\/[^\s;,'"]+|https:)$/.test(s));
}

/** Parses a comma or space separated env value into clean https sources. */
export function sourcesFromEnv(value: string | undefined): string[] {
  return cleanSources((value ?? "").split(/[\s,]+/).filter(Boolean));
}

export function contentSecurityPolicy(opts: CspOptions): string {
  const extra = opts.extra ?? {};
  const script = [
    "'self'",
    // See the file comment: the streamed React payload is inline script.
    "'unsafe-inline'",
    ...(opts.dev ? ["'unsafe-eval'"] : []),
    ...(opts.admin ? ["'wasm-unsafe-eval'"] : []),
    CSP_ORIGINS.turnstile,
    ...cleanSources(extra.script),
  ];
  const connect = [
    "'self'",
    ...(opts.dev ? ["ws:"] : []),
    ...CSP_ORIGINS.maps,
    CSP_ORIGINS.turnstile,
    ...cleanSources(extra.connect),
  ];
  const img = [
    "'self'",
    "data:",
    "blob:",
    ...CSP_ORIGINS.videoImages,
    ...CSP_ORIGINS.maps,
    ...cleanSources(extra.img),
  ];
  // Listing 360 tours and custom HTML embeds are links the agency enters (any https host),
  // so frames are limited to https rather than to a fixed list; they cannot reach the page.
  const frame = [
    "'self'",
    CSP_ORIGINS.turnstile,
    ...CSP_ORIGINS.videoFrames,
    "https:",
    ...cleanSources(extra.frame),
  ];
  const directives: Array<[string, string[]]> = [
    ["default-src", ["'self'"]],
    ["script-src", script],
    // Branding tokens are an inline <style>, and UI libraries (Radix, MapLibre) set style
    // attributes; styles cannot run script.
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["img-src", img],
    ["font-src", ["'self'", "data:"]],
    ["connect-src", connect],
    // MapLibre and the HEIC converter start their workers from blob: URLs.
    ["worker-src", ["'self'", "blob:"]],
    ["frame-src", frame],
    // Listing videos may be an https file link (lib/video.ts isVideoFileUrl).
    ["media-src", ["'self'", "blob:", "https:"]],
    ["manifest-src", ["'self'"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", [opts.frameableBySelf ? "'self'" : "'none'"]],
  ];
  const parts = directives.map(([name, values]) => `${name} ${[...new Set(values)].join(" ")}`);
  if (opts.upgradeInsecure) parts.push("upgrade-insecure-requests");
  if (opts.reportUri) parts.push(`report-uri ${opts.reportUri}`, "report-to csp");
  return parts.join("; ");
}

/** Report-only while rolling out (CSP_REPORT_ONLY=true): violations are reported, not blocked. */
export function cspHeaderName(reportOnly: boolean): string {
  return reportOnly ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy";
}

export const CSP_REPORT_PATH = "/api/csp-report";

/** Pages the admin's page builder frames (08 §1 live preview). */
export function isFrameablePath(pathname: string): boolean {
  return pathname === "/preview" || pathname.startsWith("/preview/");
}

export function isAdminPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

/** The page policy for one request, from the environment (read per request on Workers). */
export function pageCsp(
  pathname: string,
  env: Record<string, string | undefined>,
): { name: string; value: string } {
  const value = contentSecurityPolicy({
    dev: env.NODE_ENV === "development",
    admin: isAdminPath(pathname),
    frameableBySelf: isFrameablePath(pathname),
    upgradeInsecure: (env.APP_URL ?? "").startsWith("https://"),
    reportUri: CSP_REPORT_PATH,
    extra: {
      script: sourcesFromEnv(env.CSP_EXTRA_SCRIPT_SRC),
      connect: sourcesFromEnv(env.CSP_EXTRA_CONNECT_SRC),
      img: sourcesFromEnv(env.CSP_EXTRA_IMG_SRC),
      frame: sourcesFromEnv(env.CSP_EXTRA_FRAME_SRC),
    },
  });
  return { name: cspHeaderName(env.CSP_REPORT_ONLY === "true"), value };
}

/**
 * Headers for every response (next.config.ts `headers()`), pages, API and files alike.
 * Framing is refused everywhere except the page builder preview, which the admin frames.
 */
export function baseSecurityHeaders(opts: { production: boolean }): Array<{
  key: string;
  value: string;
}> {
  return [
    ...(opts.production
      ? // No includeSubDomains: the agency's domain may have other hosts this app does not run.
        [{ key: "Strict-Transport-Security", value: "max-age=63072000" }]
      : []),
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: [
        "camera=()",
        "microphone=()",
        "geolocation=()",
        "payment=()",
        "usb=()",
        "browsing-topics=()",
      ].join(", "),
    },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
    { key: "Reporting-Endpoints", value: `csp="${CSP_REPORT_PATH}"` },
  ];
}

/** The page builder preview may be framed by this site's admin (overrides the DENY above). */
export const PREVIEW_FRAME_OPTIONS = { key: "X-Frame-Options", value: "SAMEORIGIN" };

/** API responses are data, never documents: nothing may load or frame them. */
export const API_CSP = "default-src 'none'; frame-ancestors 'none'";
