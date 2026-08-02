import { NextRequest, NextResponse } from "next/server";
import {
  defaultMorningSettings,
  runMorningJob,
} from "@/lib/categorization/morning";
import { getConfig } from "@/lib/config";
import { getMorningSettings } from "@/lib/storage/store";

/**
 * Cron / webhook entrypoint for the daily morning categorization.
 * Protect with CRON_SECRET:
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
 *     http://localhost:3000/api/morning/run
 */
export async function POST(request: NextRequest) {
  try {
    const config = getConfig();
    const auth = request.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    const querySecret = request.nextUrl.searchParams.get("secret") ?? "";

    if (!config.CRON_SECRET) {
      return NextResponse.json(
        {
          error:
            "CRON_SECRET is not configured. Set it in .env.local before scheduling the morning job.",
        },
        { status: 503 },
      );
    }

    if (token !== config.CRON_SECRET && querySecret !== config.CRON_SECRET) {
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
