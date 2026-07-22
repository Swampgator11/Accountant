import { NextResponse } from "next/server";
import { createAuthorizationUrl } from "@/lib/qbo/oauth";
import { getConfig } from "@/lib/config";

export async function GET() {
  try {
    const config = getConfig();
    if (!config.qboConfigured) {
      return NextResponse.json(
        {
          error:
            "Add QBO_CLIENT_ID and QBO_CLIENT_SECRET to .env.local (see .env.example).",
          demoMode: config.DEMO_MODE,
        },
        { status: 400 },
      );
    }

    const url = await createAuthorizationUrl();
    return NextResponse.redirect(url);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Connect failed" },
      { status: 500 },
    );
  }
}
