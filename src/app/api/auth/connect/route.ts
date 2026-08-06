import { NextRequest, NextResponse } from "next/server";
import { createAuthorizationUrl } from "@/lib/qbo/oauth";
import { baseUrlFromRequest, getConfig } from "@/lib/config";
import { saveOAuthState } from "@/lib/storage/store";

export async function GET(request: NextRequest) {
  const baseUrl = baseUrlFromRequest(request);
  try {
    const config = await getConfig({ baseUrl });
    if (!config.qboConfigured) {
      return NextResponse.redirect(`${baseUrl}/?setup=1`);
    }

    const { url, state } = await createAuthorizationUrl(baseUrl);
    const response = NextResponse.redirect(url);
    // Persist OAuth state on the outbound redirect to Intuit.
    await saveOAuthState(state, response.cookies);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Connect failed";
    return NextResponse.redirect(
      `${baseUrl}/?error=${encodeURIComponent(message)}`,
    );
  }
}
