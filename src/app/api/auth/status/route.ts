import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { getValidTokens } from "@/lib/qbo/oauth";

export async function GET() {
  const config = getConfig();
  const tokens = await getValidTokens();

  return NextResponse.json({
    connected: Boolean(tokens),
    realmId: tokens?.realmId ?? null,
    qboConfigured: config.qboConfigured,
    demoMode: config.DEMO_MODE && !tokens,
    environment: config.QBO_ENVIRONMENT,
  });
}
