import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_HINT_COOKIE = "kruvo_auth_hint";
const PROTECTED_PREFIXES = ["/dashboard", "/profile/setup", "/role-select"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (!isProtected) {
    return NextResponse.next();
  }

  const hasSessionHint = request.cookies.get(SESSION_HINT_COOKIE)?.value === "active";

  if (hasSessionHint) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/dashboard/:path*", "/profile/setup/:path*", "/role-select"],
};
