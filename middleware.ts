import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge middleware: small and Edge-safe on purpose (OpenNext does not run Node middleware).
 * - Optimistic redirect to sign-in when there is no session cookie at all. This is only a
 *   convenience: every admin/account page, action and route handler checks the session itself.
 * - Passes the current path to server components (for "back to where you were" after sign-in).
 */
const PUBLIC_ADMIN_PATHS = ["/admin/sign-in", "/admin/two-factor"];

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");
  const isAccount = pathname === "/account" || pathname.startsWith("/account/");
  const isPublicAdmin = PUBLIC_ADMIN_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  if ((isAdmin && !isPublicAdmin) || isAccount) {
    const hasSession = Boolean(getSessionCookie(request, { cookiePrefix: "lintel" }));
    if (!hasSession) {
      const url = request.nextUrl.clone();
      url.pathname = isAdmin ? "/admin/sign-in" : "/sign-in";
      url.search = `?next=${encodeURIComponent(pathname + search)}`;
      return NextResponse.redirect(url);
    }
  }

  const headers = new Headers(request.headers);
  headers.set("x-lintel-path", pathname + search);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|api/|media/|og/|favicon.ico|robots.txt|sitemap.*\\.xml|.*\\.(?:png|jpg|jpeg|gif|svg|webp|avif|ico|css|js|txt|xml|woff2?)$).*)",
  ],
};
