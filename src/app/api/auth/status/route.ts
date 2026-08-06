import { NextRequest, NextResponse } from "next/server";
import { baseUrlFromRequest, getConfig } from "@/lib/config";
import { getValidTokens } from "@/lib/qbo/oauth";

export async function GET(request: NextRequest) {
  const baseUrl = baseUrlFromRequest(request);
  const config = await getConfig({ baseUrl });
  const tokens = await getValidTokens();

  return NextResponse.json({
    connected: Boolean(tokens),
    realmId: tokens?.realmId ?? null,
    qboConfigured: config.qboConfigured,
    demoMode: config.DEMO_MODE && !tokens,
    environment: config.QBO_ENVIRONMENT,
    redirectUri: config.QBO_REDIRECT_URI,
    baseUrl: config.APP_BASE_URL,
  });
}
