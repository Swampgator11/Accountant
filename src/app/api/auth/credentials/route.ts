import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  baseUrlFromRequest,
  getConfig,
  redirectUriForBase,
} from "@/lib/config";
import {
  clearCredentials,
  getCredentials,
  saveCredentials,
} from "@/lib/storage/store";

const bodySchema = z.object({
  clientId: z.string().min(8),
  clientSecret: z.string().min(8),
  environment: z.enum(["sandbox", "production"]).default("production"),
});

export async function GET(request: NextRequest) {
  const baseUrl = baseUrlFromRequest(request);
  const config = await getConfig({ baseUrl });
  const stored = await getCredentials();

  return NextResponse.json({
    configured: config.qboConfigured,
    hasStoredCredentials: Boolean(stored),
    environment: config.QBO_ENVIRONMENT,
    redirectUri: config.QBO_REDIRECT_URI,
    clientIdPreview: config.QBO_CLIENT_ID
      ? `${config.QBO_CLIENT_ID.slice(0, 6)}…${config.QBO_CLIENT_ID.slice(-4)}`
      : null,
  });
}

export async function POST(request: NextRequest) {
  try {
    const baseUrl = baseUrlFromRequest(request);
    const body = bodySchema.parse(await request.json());
    const redirectUri = redirectUriForBase(baseUrl);

    await saveCredentials({
      clientId: body.clientId.trim(),
      clientSecret: body.clientSecret.trim(),
      environment: body.environment,
      redirectUri,
    });

    return NextResponse.json({
      ok: true,
      redirectUri,
      message:
        "Credentials saved. Add this Redirect URI in your Intuit app, then connect QuickBooks.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to save credentials",
      },
      { status: 400 },
    );
  }
}

export async function DELETE() {
  await clearCredentials();
  return NextResponse.json({ ok: true });
}
