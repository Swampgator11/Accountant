import { NextRequest, NextResponse } from "next/server";
import { getMonthlyPnL } from "@/lib/qbo/client";

export async function GET(request: NextRequest) {
  try {
    const now = new Date();
    const year = Number(
      request.nextUrl.searchParams.get("year") ?? now.getFullYear(),
    );
    const month = Number(
      request.nextUrl.searchParams.get("month") ?? now.getMonth() + 1,
    );

    if (!year || month < 1 || month > 12) {
      return NextResponse.json(
        { error: "Provide a valid year and month (1-12)." },
        { status: 400 },
      );
    }

    const report = await getMonthlyPnL(year, month);
    return NextResponse.json({ report });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load P&L",
      },
      { status: 500 },
    );
  }
}
