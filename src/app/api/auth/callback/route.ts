import { NextRequest, NextResponse } from "next/server";
import { handleOAuthCallback } from "@/lib/qbo/oauth";
import { baseUrlFromRequest } from "@/lib/config";

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
    await handleOAuthCallback({ code, state, realmId, baseUrl });
    return NextResponse.redirect(`${baseUrl}/?connected=1`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "OAuth failed";
    return NextResponse.redirect(
      `${baseUrl}/?error=${encodeURIComponent(message)}`,
    );
  }
}
