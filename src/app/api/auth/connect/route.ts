import { NextRequest, NextResponse } from "next/server";
import { createAuthorizationUrl } from "@/lib/qbo/oauth";
import { baseUrlFromRequest, getConfig } from "@/lib/config";

export async function GET(request: NextRequest) {
  try {
    const baseUrl = baseUrlFromRequest(request);
    const config = await getConfig({ baseUrl });
    if (!config.qboConfigured) {
      return NextResponse.redirect(`${baseUrl}/?setup=1`);
    }

    const url = await createAuthorizationUrl(baseUrl);
    return NextResponse.redirect(url);
  } catch (error) {
    const baseUrl = baseUrlFromRequest(request);
    const message = error instanceof Error ? error.message : "Connect failed";
    return NextResponse.redirect(
      `${baseUrl}/?error=${encodeURIComponent(message)}`,
    );
  }
}
