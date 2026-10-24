import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import {
  VISITOR_COOKIE,
  VISITOR_MAX_AGE,
  visitorCookieUpdate,
  visitorCookieValue,
} from "@/features/attribution/visitor-cookie";
import { edgeRedirect } from "@/features/seo/edge-redirects";
import { CONSENT_COOKIE, parseConsent } from "@/lib/consent";

/**
 * Edge middleware: small and Edge-safe on purpose (OpenNext does not run Node middleware).
 * - Optimistic redirect to sign-in when there is no session cookie at all. This is only a
 *   convenience: every admin/account page, action and route handler checks the session itself.
 * - Passes the current path to server components (for "back to where you were" after sign-in).
 * - Gives site visitors their first-party visitor id (09 §2), only when it is new or consent
 *   changed, so cached pages are not sent with a cookie every time.
 * - Serves the redirects manager's rules with their real 301/302 (08 §6) before pages stream.
 */
const PUBLIC_ADMIN_PATHS = ["/admin/sign-in", "/admin/two-factor"];

export async function middleware(request: NextRequest, event: NextFetchEvent) {
  const { pathname, search } = request.nextUrl;
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");
  const isAccount = pathname === "/account" || pathname.startsWith("/account/");
  const isPublicAdmin = PUBLIC_ADMIN_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  if ((isAdmin && !isPublicAdmin) || isAccount) {
    const hasSession = Boolean(getSessionCookie(request, { cookiePrefix: "keyline" }));
    if (!hasSession) {
      const url = request.nextUrl.clone();
      url.pathname = isAdmin ? "/admin/sign-in" : "/sign-in";
      url.search = `?next=${encodeURIComponent(pathname + search)}`;
      return NextResponse.redirect(url);
    }
  }

  if (!isAdmin && !isAccount && (request.method === "GET" || request.method === "HEAD")) {
    const moved = await edgeRedirect(request.nextUrl, (p) => event.waitUntil(p));
    if (moved) return NextResponse.redirect(moved.location, moved.status);
  }

  const headers = new Headers(request.headers);
  headers.set("x-keyline-path", pathname + search);
  const response = NextResponse.next({ request: { headers } });
  if (!isAdmin) {
    const consent = parseConsent(request.cookies.get(CONSENT_COOKIE)?.value);
    const update = visitorCookieUpdate(
      request.cookies.get(VISITOR_COOKIE)?.value,
      consent ? !consent.analytics : false,
      () => crypto.randomUUID(),
    );
    if (update)
      response.cookies.set({
        name: VISITOR_COOKIE,
        value: visitorCookieValue(update),
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: request.nextUrl.protocol === "https:",
        ...(update.sessionOnly ? {} : { maxAge: VISITOR_MAX_AGE }),
      });
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|api/|media/|og/|favicon.ico|robots.txt|sitemap.*\\.xml|.*\\.(?:png|jpg|jpeg|gif|svg|webp|avif|ico|css|js|txt|xml|woff2?)$).*)",
  ],
};
