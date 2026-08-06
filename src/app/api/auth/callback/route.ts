import { NextRequest, NextResponse } from "next/server";
import { handleOAuthCallback } from "@/lib/qbo/oauth";
import { baseUrlFromRequest } from "@/lib/config";
import { clearOAuthState, saveTokens } from "@/lib/storage/store";

export async function GET(request: NextRequest) {
  const baseUrl = baseUrlFromRequest(request);
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const state = params.get("state");
  const realmId = params.get("realmId");
  const error = params.get("error");

  if (error) {
    return NextResponse.redirect(
      `${baseUrl}/?error=${encodeURIComponent(error)}`,
    );
  }

  if (!code || !state || !realmId) {
    return NextResponse.redirect(
      `${baseUrl}/?error=${encodeURIComponent("Missing OAuth parameters")}`,
    );
  }

  try {
    const tokens = await handleOAuthCallback({
      code,
      state,
      realmId,
      baseUrl,
      // Prefer state from the inbound request cookies (set on the Intuit redirect).
      requestCookies: request.cookies,
    });

    const response = NextResponse.redirect(`${baseUrl}/?connected=1`);
    // Attach tokens on the redirect response itself so browsers keep them after
    // returning from Intuit. cookies().set() alone can be dropped on redirects.
    await saveTokens(tokens, response.cookies);
    await clearOAuthState(response.cookies);
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "OAuth failed";
    return NextResponse.redirect(
      `${baseUrl}/?error=${encodeURIComponent(message)}`,
    );
  }
}
