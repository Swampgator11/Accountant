import { NextRequest, NextResponse } from "next/server";
import {
  defaultMorningSettings,
  runMorningJob,
} from "@/lib/categorization/morning";
import { getConfig } from "@/lib/config";
import { getMorningSettings } from "@/lib/storage/store";

async function handle(request: NextRequest) {
  try {
    const config = await getConfig();
    const auth = request.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    const querySecret = request.nextUrl.searchParams.get("secret") ?? "";
    // Vercel Cron sends this header automatically.
    const cronHeader = request.headers.get("x-vercel-cron");

    if (!config.CRON_SECRET && !cronHeader) {
      return NextResponse.json(
        {
          error:
            "CRON_SECRET is not configured. Set it in the Vercel project env before scheduling the morning job.",
        },
        { status: 503 },
      );
    }

    const authorized =
      Boolean(cronHeader) ||
      (Boolean(config.CRON_SECRET) &&
        (token === config.CRON_SECRET || querySecret === config.CRON_SECRET));

    if (!authorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const settings = {
      ...defaultMorningSettings(),
      ...(await getMorningSettings()),
    };

    if (!settings.enabled) {
      return NextResponse.json({
        skipped: true,
        reason: "Morning job disabled",
      });
    }

    const result = await runMorningJob({ retrain: true });
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Morning cron run failed",
      },
      { status: 500 },
    );
  }
}

/** Vercel Cron uses GET. */
export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
