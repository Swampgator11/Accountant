import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  defaultMorningSettings,
  runMorningJob,
} from "@/lib/categorization/morning";
import {
  getMorningRuns,
  getMorningSettings,
  saveMorningSettings,
} from "@/lib/storage/store";

export async function GET() {
  try {
    const settings = {
      ...defaultMorningSettings(),
      ...(await getMorningSettings()),
    };
    const runs = await getMorningRuns();
    return NextResponse.json({ settings, runs });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load morning settings",
      },
      { status: 500 },
    );
  }
}

const settingsSchema = z.object({
  enabled: z.boolean(),
  hourLocal: z.number().int().min(0).max(23),
  timezone: z.string().min(1),
  minConfidence: z.number().min(0).max(1),
  autoApply: z.boolean(),
});

export async function PUT(request: NextRequest) {
  try {
    const body = settingsSchema.parse(await request.json());
    const current = {
      ...defaultMorningSettings(),
      ...(await getMorningSettings()),
    };
    const settings = {
      ...current,
      ...body,
    };
    await saveMorningSettings(settings);
    return NextResponse.json({ settings });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to save morning settings",
      },
      { status: 400 },
    );
  }
}

/** Manual morning run from the UI (always allowed; cron uses /api/morning/run). */
export async function POST(request: NextRequest) {
  try {
    const settings = {
      ...defaultMorningSettings(),
      ...(await getMorningSettings()),
    };

    let retrain = true;
    try {
      const json = await request.json();
      if (typeof json?.retrain === "boolean") retrain = json.retrain;
    } catch {
      // empty body is fine
    }

    if (!settings.enabled) {
      return NextResponse.json(
        { error: "Morning job is disabled in settings." },
        { status: 400 },
      );
    }

    const result = await runMorningJob({ retrain });
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Morning job failed",
      },
      { status: 500 },
    );
  }
}
