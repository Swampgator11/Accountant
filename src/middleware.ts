import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, readSessionEmail } from "@/lib/auth/session";

const PUBLIC_PREFIXES = [
  "/login",
  "/api/login",
  "/api/auth/callback",
  "/api/morning/run",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Auth gate only when AUTH_EMAIL / AUTH_PASSWORD are configured (Vercel).
  const authEmail = process.env.AUTH_EMAIL;
  const authPassword = process.env.AUTH_PASSWORD;
  if (!authEmail || !authPassword) {
    return NextResponse.next();
  }

  if (
    PUBLIC_PREFIXES.some(
      (p) => pathname === p || pathname.startsWith(`${p}/`),
    )
  ) {
    return NextResponse.next();
  }

  // Static assets / next internals
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const session = await readSessionEmail(
    request.cookies.get(SESSION_COOKIE)?.value,
  );
  if (session) {
    return NextResponse.next();
  }

  // Browser click on Connect should bounce to login, not a raw JSON 401 page
  // (which looks like the button "did nothing").
  if (pathname === "/api/auth/connect") {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    return NextResponse.redirect(loginUrl);
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
