import { NextRequest, NextResponse } from "next/server";
import { createAuthorizationUrl } from "@/lib/qbo/oauth";
import { baseUrlFromRequest, getConfig } from "@/lib/config";
import { sealJson } from "@/lib/storage/crypto";

export async function GET(request: NextRequest) {
  const baseUrl = baseUrlFromRequest(request);
  try {
    const config = await getConfig({ baseUrl });
    if (!config.qboConfigured) {
      return NextResponse.redirect(`${baseUrl}/?setup=1`);
    }

    const { url, state } = await createAuthorizationUrl(baseUrl);
    const response = NextResponse.redirect(url);

    // Attach OAuth state on the redirect response itself. Relying only on
    // cookies().set() during a redirect can drop the cookie on some Vercel
    // paths, which makes Intuit return successfully while our callback fails
    // with "Invalid OAuth state" — looking like Connect "did nothing".
    const sealed = await sealJson({ state, createdAt: Date.now() });
    response.cookies.set("aa_oauth", sealed, {
      httpOnly: true,
      secure:
        process.env.VERCEL === "1" || process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 15,
    });

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Connect failed";
    return NextResponse.redirect(
      `${baseUrl}/?error=${encodeURIComponent(message)}`,
    );
  }
}
